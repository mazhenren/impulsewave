/**
 * 星球动态首页生成器：输出 /（path 空字符串 → public/index.html，layout: page）。
 *
 * 背景主题机制（源码核实，v1/v2 相同）：
 * - Stellar path_normalize.js 会把 Page 路径 index.html 归一为 index/，且主题脚本晚于站点
 *   脚本注册 generateBefore，站点侧无法后置修正 —— 因此首页不能走 source/index.md 的 Page 路由。
 * - path 为空字符串的路由不会被归一化，本 generator 采用该机制直接输出首页。
 * - timeline 标签服务端展开结果就是一个带 data-api 的空容器，内容由主题客户端脚本
 *   （source/js/services/timeline.js）fetch 渲染 —— 这里直接写等价 HTML，标签不参与构建。
 * - 必须绝对地址：timeline service 会执行 new URL(data-api)，相对路径抛 Invalid URL 导致整段不渲染。
 * - data.__index = true 让 is_home() 为真，导航高亮与标题逻辑与旧版一致。
 */
'use strict';

hexo.extend.generator.register('planet-home', function () {
  const siteBase = hexo.config.url.replace(/\/$/, '');
  // 构建时间戳：避免 GitHub Pages CDN / 浏览器缓存到上一版 planet-issues.json
  const feedVersion = Date.now();
  const content = [
    '<p>交易复盘短图文信息流：股票、期货、外汇的即时观察与笔记。帖子由 GitHub Issue 自动同步生成，正文直接在信息流内展开，点「查看详情」进入文章页，评论区直连原 Issue 讨论。</p>',
    `<div class="tag-plugin timeline data-service ds-timeline" data-api="${siteBase}/planet-issues.json?v=${feedVersion}"></div>`
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


