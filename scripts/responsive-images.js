'use strict';

/**
 * 正文图片响应式交付（构建期改写，不依赖客户端 JS）。
 *
 * 阶段：after_post_render —— 此时正文已由 marked 渲染成 HTML、尚未进入模板。
 * 文章页与星球信息流共用同一份 p.content，因此在这一处改写可同时覆盖两条链路。
 *
 * 产出：<img> 增加 srcset / sizes / loading / decoding / width / height / onerror。
 * - srcset 指向 Gcore CDN 上的 WebP 多尺寸变体（由 optimize-images.js 生成）
 * - src 保留原站图片，作为兜底
 * - onerror 时去掉 srcset 并强制回源，避免第三方 CDN 不可用导致图片空白
 *
 * 刻意不添加 class="lazy"：主题 img_lazyload 会跳过带 srcset 的 <img>，
 * 这里改为使用浏览器原生懒加载，避免两套懒加载逻辑互相覆盖。
 */

const path = require('path');
const sharp = require('sharp');
const {
  isAvatar,
  variantRoute,
  widthsFor,
  publicUrl
} = require('./lib/image-variants');

const SRC_RE = /src\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const IMG_RE = /<img\b[^>]*>/gi;

// 一次构建内同一张图只读一次元数据
const sizeCache = new Map();

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
  if (/srcset\s*=/i.test(tag) || /data-src\s*=/i.test(tag)) return tag;

  const match = SRC_RE.exec(tag);
  if (!match) return tag;
  const src = match[1] != null ? match[1] : match[2];
  if (!src || /^data:/i.test(src)) return tag;

  const routePath = toRoutePath(src, root);
  if (!routePath || isAvatar(routePath)) return tag;

  const size = await readSize(routePath);
  if (!size) return tag;

  const srcset = widthsFor(size.width, routePath)
    .map((width) => `${publicUrl(variantRoute(routePath, width), root)} ${width}w`)
    .join(', ');

  let attrs = ` srcset="${srcset}" sizes="(max-width: 768px) 100vw, 800px"`;
  if (!/\bwidth\s*=/i.test(tag)) attrs += ` width="${size.width}"`;
  if (!/\bheight\s*=/i.test(tag)) attrs += ` height="${size.height}"`;
  attrs += ' loading="lazy" decoding="async"';
  attrs += ` onerror="this.onerror=null;this.removeAttribute('srcset');this.removeAttribute('sizes');this.removeAttribute('src');this.src='${src}'"`;

  return injectAttrs(tag, attrs);
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
      hexo.log.warn('[images] 响应式改写失败：%s', err.message);
    }
  }
  data.content = out;
  return data;
});
