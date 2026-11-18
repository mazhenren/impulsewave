/**
 * 在专栏列表页的标签栏最左侧插入「星球」入口。
 *
 * Stellar 的 listing-nav 由 layout/_partial/main/listing_nav/blog.ejs 渲染，
 * 固定的第一个标签是「近期发布」，主题配置里的 listingNav.tabs 只能追加到「归档」之后，
 * 无法指定插到最前面；因此这里在 HTML 渲染完成后把入口插到 <nav class="post"> 的开头。
 */
'use strict';

const { url_for } = require('hexo-util');

hexo.extend.filter.register('after_render:html', function (html) {
  if (typeof html !== 'string' || !html) return html;
  if (html.indexOf('listing-nav') === -1) return html;
  if (html.indexOf('data-planet-tab') !== -1) return html;

  // 直接指向星球首页（真实页面），不再经过 /planet/ 跳转页：
  // 少一次 meta refresh，点击后标签栏随页面一起消失，不会出现导航残留
  const href = url_for.call(hexo, '/');
  const tab = `<a data-planet-tab href="${href}">星球</a>`;

  return html.replace(/(<div class="listing-nav">[\s\S]*?<nav class="post">)/, `$1${tab}`);
}, 9);
