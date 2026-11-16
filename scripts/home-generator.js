/**
 * 星球动态首页生成器：输出 /（path 空字符串 → public/index.html，layout: page）。
 *
 * 背景主题机制（源码核实）：
 * - Stellar path_normalize.js 会把 Page 路径 index.html 归一为 index/，且主题脚本晚于站点
 *   脚本注册 generateBefore，站点侧无法后置修正 —— 因此首页不能走 source/index.md 的 Page 路由。
 * - index_generator.path: '' 的旧首页一直正常（route.format 对空路径不归一化），
 *   本 generator 采用同机制直接输出首页路由。
 * - timeline 标签服务端展开结果就是一个带 data-api 的空容器，内容由主题客户端脚本
 *   （timeline.js service）fetch 渲染 —— generator 直接写等价 HTML 字符串即可，标签不参与构建。
 */
'use strict';

hexo.extend.generator.register('planet-home', function () {
  // 站根相对路径（如 /impulsewave/），本地预览与线上一致
  const root = hexo.config.root || '/';
  const content = [
    '<p>交易复盘短图文信息流：股票、期货、外汇的即时观察与笔记。帖子由 GitHub Issue 自动同步生成，点击标题阅读全文，评论区直连原 Issue 讨论，无需跳转。</p>',
    `<div class="tag-plugin timeline data-service ds-timeline" data-api="${root}planet-issues.json"></div>`
  ].join('\n');

  return {
    path: '',
    layout: ['page'],
    data: {
      title: '星球动态',
      subtitle: '股票 · 期货 · 外汇 技术分析笔记',
      date: '2025-01-01 09:00:00',
      updated: undefined,
      path: '',
      menu_id: 'planet',
      comments: false,
      leftbar: 'author_card, recent, visitor',
      content: content
    }
  };
});
