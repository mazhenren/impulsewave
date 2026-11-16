/**
 * 修正文章页 canonical 缺失站点子路径的问题。
 *
 * 背景（已核对主题源码）：
 * - Stellar v2 文章页 canonical 由 scripts/lib/models/shared.js 的
 *   canonicalUrl(canonical.host, item.route.path) 生成，形如
 *   `https://<host>/<去掉 config.root 的相对路径>/`；
 * - item.route.path 不含站点根（`/impulsewave`），而 canonical.host 只接受域名
 *   （client-assets.js 用 btoa(host) 做克隆站校验，带路径会误报「非法克隆站」），
 *   因此项目站下文章页 canonical 会缺 `/impulsewave`（列表页/首页走另一条逻辑，本身正确）。
 *
 * 处理：渲染完成后（晚于主题的 after_render:html 过滤）把缺失的子路径补回。
 * 只改 canonical 的值，不动 og:url / JSON-LD（它们用 route.permalink，本来就正确）。
 */
'use strict';

const siteUrl = String(hexo.config.url || '').replace(/\/+$/, '');
const parsed = (() => {
  try {
    return new URL(siteUrl);
  } catch (e) {
    return null;
  }
})();

const subpath = parsed ? parsed.pathname.replace(/^\/+|\/+$/g, '') : '';

if (parsed && subpath) {
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linkPattern = new RegExp(`<link rel="canonical" href="${escapeRegExp(parsed.origin)}/([^"]*)"`, 'g');

  hexo.extend.filter.register('after_render:html', function (str) {
    if (typeof str !== 'string' || !str.includes('rel="canonical"')) return str;
    return str.replace(linkPattern, (tag, rest) => {
      // 已含子路径，或 404 页（没有可索引的正式地址）保持原样
      if (rest.startsWith(`${subpath}/`) || rest.startsWith('404/')) return tag;
      return `<link rel="canonical" href="${parsed.origin}/${subpath}/${rest}"`;
    });
  }, 2000);
}

module.exports = { subpath };
