/**
 * 文章页页头补「标签」行（面包屑下方）。
 *
 * Stellar v2 的文章横幅只在右上角显示「N 字 · 预计阅读 M 分钟」，
 * 标签只出现在正文末尾的 .article-tags。这里在 .meta-row 里追加一行标签，
 * 让页头一次性看到 字数 / 时长 / 标签 三类信息，正文末尾的标签块保持不动。
 *
 * 只处理 layout === 'post' 且有标签的页面；无标签或非文章页原样返回。
 */
'use strict';

const { url_for } = require('hexo-util');

hexo.extend.filter.register('after_render:html', function (html, locals) {
  if (typeof html !== 'string' || !html) return html;
  const page = locals && locals.page;
  if (!page || page.layout !== 'post' || !page.tags) return html;

  const tags = page.tags.toArray ? page.tags.toArray() : Array.from(page.tags);
  if (!tags.length) return html;
  // 幂等
  if (html.indexOf('id="bread-tags"') !== -1) return html;

  const links = tags
    .map(tag => {
      const href = url_for.call(hexo, tag.path);
      return `<a class="cap breadcrumb" href="${href}">${tag.name}</a>`;
    })
    .join('');

  const row = `<div class="flex-row" id="bread-tags"><span class="cap tag-label">标签：</span>${links}</div>`;

  return html.replace(/(<div class="flex-row" id="post-meta">[\s\S]*?<\/div>)/, m => m + row);
}, 10);
