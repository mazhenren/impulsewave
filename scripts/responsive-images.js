'use strict';

/**
 * 正文图片交付（构建期改写，不依赖客户端 JS）。
 *
 * 阶段：after_post_render —— 此时正文已由 marked 渲染成 HTML、尚未进入模板。
 * 文章页与星球信息流共用同一份 p.content，因此在这一处改写可同时覆盖两条链路。
 *
 * 关键约束：构建期不对图片做任何重编码与缩放，原图像素与画质原样直出。
 * 这里只做三件不改变字节的事：
 *   1. src 前置 Gcore CDN，加速国内访问（CDN 上就是 public/ 里的原图）
 *   2. 补 width/height 防止布局抖动，并启用浏览器原生懒加载
 *   3. CDN 不可用时 onerror 回源站内地址，避免图片空白
 *
 * 刻意不添加 class="lazy"、不输出 srcset：没有多尺寸变体，
 * 用原生懒加载即可，也避免与主题 img_lazyload 出现两套懒加载逻辑。
 */

const path = require('path');
const sharp = require('sharp');

// jsDelivr 的 Gcore 节点；@gh-pages 是 public/ 的产物分支
const CDN_BASE = 'https://gcore.jsdelivr.net/gh/mazhenren/impulsewave@gh-pages';

// 一键关闭 CDN：false 时保持站内地址，行为等同于纯静态站点
const ENABLE_CDN = true;

const SRC_RE = /src\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const IMG_RE = /<img\b[^>]*>/gi;

// 一次构建内同一张图只读一次元数据
const sizeCache = new Map();

/** 是否为头像（不参与 CDN 改写，避免主题里同名头像出现两种来源） */
function isAvatar(routePath) {
  return /(^|\/)avatar\.[^/]+$/i.test(String(routePath));
}

/** route 路径 → 可对外访问的地址（CDN 或原站） */
function publicUrl(routePath, root = '/') {
  const clean = String(routePath).replace(/^\/+/, '');
  if (ENABLE_CDN) return CDN_BASE + '/' + clean;
  return String(root).replace(/\/?$/, '/') + clean;
}

function readSize(routePath) {
  if (!sizeCache.has(routePath)) {
    const file = path.join(hexo.source_dir, routePath);
    sizeCache.set(
      routePath,
      sharp(file, { failOn: 'none' })
        .metadata()
        .then((meta) => (meta.width && meta.height ? { width: meta.width, height: meta.height } : null))
        .catch(() => null)
    );
  }
  return sizeCache.get(routePath);
}

/** 站内图片地址 → route 路径（images/...）；外链与不支持的类型返回 null */
function toRoutePath(src, root) {
  let value = String(src || '').split('?')[0].split('#')[0];
  if (!value) return null;
  const prefix = String(root || '/').replace(/\/?$/, '/');
  if (value.startsWith(prefix)) value = value.slice(prefix.length);
  else if (value.startsWith('/')) value = value.replace(/^\/+/, '');
  else return null;
  if (!value.startsWith('images/')) return null;
  if (!/\.(jpe?g|png)$/i.test(value)) return null;
  return value;
}

function injectAttrs(tag, attrs) {
  const selfClose = /\/>\s*$/.test(tag);
  const body = tag.replace(/\s*\/?>\s*$/, '');
  return body + attrs + (selfClose ? ' />' : '>');
}

async function rewriteTag(tag, root) {
  // 幂等：已处理过（或主题已改造）的图片不再重复注入
  if (/srcset\s*=/i.test(tag) || /data-src\s*=/i.test(tag) || /onerror\s*=/i.test(tag)) return tag;

  const match = SRC_RE.exec(tag);
  if (!match) return tag;
  const src = match[1] != null ? match[1] : match[2];
  if (!src || /^data:/i.test(src)) return tag;

  const routePath = toRoutePath(src, root);
  if (!routePath || isAvatar(routePath)) return tag;

  const size = await readSize(routePath);

  let attrs = '';
  if (size) {
    if (!/\bwidth\s*=/i.test(tag)) attrs += ` width="${size.width}"`;
    if (!/\bheight\s*=/i.test(tag)) attrs += ` height="${size.height}"`;
  }
  attrs += ' loading="lazy" decoding="async"';

  const cdnSrc = publicUrl(routePath, root);
  if (cdnSrc && cdnSrc !== src) {
    attrs += ` onerror="this.onerror=null;this.src='${src}'"`;
  }

  let out = injectAttrs(tag, attrs);
  if (cdnSrc && cdnSrc !== src) out = out.replace(SRC_RE, `src="${cdnSrc}"`);
  return out;
}

hexo.extend.filter.register('after_post_render', async function (data) {
  if (!data || typeof data.content !== 'string' || data.content.indexOf('<img') === -1) return data;

  const root = (hexo.config && hexo.config.root) || '/';
  const tags = data.content.match(IMG_RE);
  if (!tags || !tags.length) return data;

  let out = data.content;
  for (const tag of tags) {
    try {
      const next = await rewriteTag(tag, root);
      if (next !== tag) out = out.replace(tag, () => next);
    } catch (err) {
      hexo.log.warn('[images] 图片改写失败：%s', err.message);
    }
  }
  data.content = out;
  return data;
});
