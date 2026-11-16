/**
 * 星球动态首页生成器：输出 /（path 空字符串 → public/index.html，layout: page）。
 *
 * 数据源是构建期生成的 planet-feed.json（博客文章结构），由 source/js/planet-enhance.js
 * 客户端渲染成星球式信息流。容器刻意不加 ds-timeline 类，避免 Stellar 的
 * GitHub Issues timeline service 接管（它只认 Issue 字段格式）。
 * data-api 带构建时间戳，避免 GitHub Pages CDN 缓存上一版数据。
 */
'use strict';

hexo.extend.generator.register('planet-home', function () {
  const siteBase = hexo.config.url.replace(/\/$/, '');
  // 构建时间戳：避免 GitHub Pages CDN / 浏览器缓存到上一版 planet-feed.json
  const feedVersion = Date.now();
  const content = [
    '<p>交易复盘短图文信息流：股票、期货、外汇的即时观察与笔记。内容由博客文章在构建时生成，正文直接在信息流内展开，点「查看详情」进入文章页，评论区直连原帖讨论。</p>',
    `<div class="tag-plugin timeline planet-feed" data-api="${siteBase}/planet-feed.json?v=${feedVersion}"></div>`
  ].join('\n');

  return {
    path: '',
    layout: ['page'],
    data: {
      __index: true,
      title: '星球动态',
      subtitle: '股票 · 期货 · 外汇 技术分析笔记',
      date: '2025-01-01 09:00:00',
      path: '',
      content: content
    }
  };
});

/**
 * 首页不显示主题评论区。
 *
 * v2 的通用 page 布局统一调用 comments_model(page)（依据 front matter 解析结果），
 * 而本 generator 输出的是内存对象、没有源文件，解析结果为空 → 会回落到全局 utterances
 * （issue-term: pathname），在首页凭空开一个 Issue。
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


