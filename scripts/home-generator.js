/**
 * 星球动态首页生成器：输出 /（path 空字符串 → public/index.html，layout: page）。
 *
 * 数据源是构建期生成的 planet-feed.json（博客文章结构），由 source/js/planet-feed.js
 * 客户端渲染成星球式信息流。容器类名刻意用 .planet-feed，不再复用主题的
 * tag-plugin/timeline 语义：Stellar 的 GitHub Issues timeline 服务只认 .ds-timeline，
 * 且该标签插件已在 scripts/planet-timeline-off.js 里注销。
 * data-api 带构建时间戳，避免 GitHub Pages CDN 缓存上一版数据。
 */
'use strict';

const { url_for } = require('hexo-util');

hexo.extend.generator.register('planet-home', function () {
  const siteBase = hexo.config.url.replace(/\/$/, '');
  // 构建时间戳：避免 GitHub Pages CDN / 浏览器缓存到上一版 planet-feed.json
  const feedVersion = Date.now();
  const content = [
    `<div class="planet-feed" data-api="${siteBase}/planet-feed.json?v=${feedVersion}"></div>`
  ].join('\n');

  return {
    path: '',
    layout: ['page'],
    data: {
      __index: true,
      title: '星球',
      subtitle: '股票 · 期货 · 外汇 技术分析笔记',
      date: '2025-01-01 09:00:00',
      path: '',
      content: content
    }
  };
});

/**
 * 首页不显示页头横幅。
 *
 * 需求：星球动态页移除「主页 / 星球动态 / 作者 / 日期」这一组页头字段（含标题）。
 * 主题的 banner.enabled 只对 collection pipeline 构建的页面生效，本 generator 输出的是
 * 内存页、取不到 pageConfig，因此改为在 HTML 渲染完成后按模板结构裁掉整个横幅块：
 * 从 `<div class="article-banner-wrap` 起，到正文 `<article class="md-text content` 止。
 */
/**
 * 星球页也要有列表页那条标签栏（星球 | 专栏 | 分类 | 标签 | 归档），
 * 且「星球」处于 active，这样点标签时和点「专栏」的体验一致（同一组件、同样吸顶）。
 *
 * 主题的 listing-nav 只在 blog_index 等列表布局里渲染，星球页是内存页布局，
 * 因此这里按主题相同的 DOM 结构补一份；data-planet-tab 让 listing-nav-planet.js
 * 不会再往里插重复的「星球」。
 */
function buildListingNav() {
  const link = (title, url, active) =>
    `<a${active ? ' class="active"' : ''} href="${url_for.call(hexo, url)}">${title}</a>`;
  return [
    '<div class="listing-nav"><div class="listing-nav__surface"><div class="listing-nav__viewport"><nav class="post">',
    `<a data-planet-tab class="active" href="${url_for.call(hexo, '/')}">星球</a>`,
    link('专栏', '/posts/'),
    link('分类', '/categories/'),
    link('标签', '/tags/'),
    link('归档', '/archives/'),
    '</nav></div></div></div>'
  ].join('');
}

hexo.extend.filter.register('after_render:html', function (html, locals) {
  if (typeof html !== 'string' || !html) return html;
  const page = locals && locals.page;
  const isHome = page && page.__index && (!locals.path || locals.path === 'index.html');
  if (!isHome) return html;
  const start = html.indexOf('<div class="article-banner-wrap');
  const end = html.indexOf('<article class="md-text content');
  if (start === -1 || end === -1 || end <= start) return html;
  // 裁掉横幅，并在正文前补上标签栏
  return html.slice(0, start) + buildListingNav() + html.slice(end);
}, 8);

/**
 * 首页不显示主题评论区。
 *
 * v2 的通用 page 布局统一调用 comments_model(page)（依据 front matter 解析结果），
 * 而本 generator 输出的是内存对象、没有源文件，解析结果为空 → 会回落到全局评论
 * （Waline），在首页凭空出现一个评论框。
 *
 * 注意：站点 scripts 与主题 scripts 在 loadScripts 阶段同批加载，加载顺序不保证，
 * 因此不能在脚本顶层用 `hexo.extend.helper.get()` 取主题原实现；必须等 generateBefore（
 * 全部插件与脚本加载完成后）再包装。
 */
hexo.on('generateBefore', () => {
  const themeCommentsModel = hexo.extend.helper.get('comments_model');
  if (typeof themeCommentsModel !== 'function' || themeCommentsModel.__planetHome) return;
  const wrapped = function (page, overrides) {
    // path 为空字符串 = 本 generator 输出的首页
    if (page && page.__index && page.path === '') {
      return Object.freeze({
        enabled: false, title: '', id: '', service: '', options: Object.freeze({}),
        assets: Object.freeze({}), pageTitle: String(page.title || '')
      });
    }
    return themeCommentsModel.call(this, page, overrides);
  };
  wrapped.__planetHome = true;
  hexo.extend.helper.register('comments_model', wrapped);
});


