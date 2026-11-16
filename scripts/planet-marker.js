/**
 * GitHub Issue 来源标记（构建期注入，不依赖客户端 JS）。
 *
 * 阶段：after_render:html —— 主题已渲染出完整 HTML、尚未写入 public/。
 * 只处理「星球帖」页面，其余页面原样返回，因此对博客文章零影响。
 *
 * 注入三层标记，任一层都可在构建产物里直接 grep 验证：
 *   1. 文档级：<html ... data-planet-source="github-issue" data-issue-number="N">
 *   2. 头部元数据：<meta name="planet:source|planet:issue-number|planet:issue-url">
 *   3. 页面可见徽标：<a class="planet-source-badge" href=".../issues/N">
 *
 * 星球帖判定沿用 scripts/planet-source.js 的唯一规则（源文件名 planet-<n>.md）；
 * 页面与帖子编号的映射在 before_generate 阶段从 Post 模型预先建立，
 * 不依赖 locals.page 的内部字段，避免主题/Hexo 升级导致判定失效。
 */
'use strict';

const { parseIssueNumber, issueUrl } = require('./planet-source');

/** HTML 输出路径归一化：posts/784dd132/index.html → posts/784dd132 */
function normalizePath(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/index\.html$/i, '')
    .replace(/\/+$/, '');
}

/** 构建期缓存：归一化输出路径 → Issue 编号 */
let planetPathMap = new Map();

// 必须在星球帖仍能被 Post 模型读到的时候建立映射（locals.posts 已被隔离剔除）
hexo.extend.filter.register('before_generate', function () {
  const map = new Map();
  try {
    this.model('Post').find({ published: true }).each(post => {
      const num = parseIssueNumber(post && post.source);
      if (num == null || !post.path) return;
      map.set(normalizePath(post.path), num);
    });
  } catch (err) {
    hexo.log.warn('[planet-marker] 读取 Post 模型失败，来源标记未生效：%s', err.message);
  }
  planetPathMap = map;
  if (map.size) hexo.log.info('[planet-marker] 待标记星球帖 %d 篇', map.size);
}, 3);

/** 解析当前页面对应的 Issue 编号；非星球帖返回 null */
function resolveIssueNumber(locals) {
  const byPath = planetPathMap.get(normalizePath(locals && locals.path));
  if (byPath != null) return byPath;
  // 兜底：post 生成器直接把 Post 对象作为 data 传入，部分版本可从 page.source 取到
  return parseIssueNumber(locals && locals.page && locals.page.source);
}

function buildBadge(num) {
  const url = issueUrl(num);
  return [
    `<a class="planet-source-badge" href="${url}" target="_blank"`,
    ' rel="external nofollow noopener noreferrer"',
    ` data-planet-source="github-issue" data-issue-number="${num}">`,
    '<span class="planet-source-tag">GitHub Issue</span>',
    `<span class="planet-source-num">#${num}</span>`,
    '<span class="planet-source-hint">由 Issue 自动同步</span>',
    '</a>'
  ].join('');
}

function injectMarker(html, num) {
  let out = html;

  // 1. 文档级属性（幂等：已存在则不重复写入）
  out = out.replace(/<html(\s[^>]*)?>/i, (m, attrs) => {
    const a = attrs || '';
    if (/data-planet-source=/i.test(a)) return m;
    return `<html${a} data-planet-source="github-issue" data-issue-number="${num}">`;
  });

  // 2. 头部元数据
  if (!/name="planet:source"/i.test(out)) {
    const metas = [
      '<meta name="planet:source" content="github-issue">',
      `<meta name="planet:issue-number" content="${num}">`,
      `<meta name="planet:issue-url" content="${issueUrl(num)}">`
    ].join('\n') + '\n';
    if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, metas + '</head>');
  }

  // 3. 可见徽标（文章页正文底部、许可区块之前；找不到锚点则退回 body 末尾）
  if (!/class="planet-source-badge"/i.test(out)) {
    const badge = buildBadge(num);
    if (out.indexOf('<div class="article-footer slide-up">') !== -1) {
      out = out.replace('<div class="article-footer slide-up">', badge + '\n<div class="article-footer slide-up">');
    } else if (/<\/body>/i.test(out)) {
      out = out.replace(/<\/body>/i, badge + '\n</body>');
    }
  }

  return out;
}

hexo.extend.filter.register('after_render:html', function (html, locals) {
  // 渲染失败时上游可能给出空值，原样返回，不制造新的错误
  if (typeof html !== 'string' || !html) return html;
  let num = null;
  try {
    num = resolveIssueNumber(locals);
  } catch (err) {
    hexo.log.warn('[planet-marker] 解析页面来源失败：%s', err.message);
    return html;
  }
  if (num == null) return html;
  try {
    return injectMarker(html, num);
  } catch (err) {
    hexo.log.warn('[planet-marker] 注入标记失败（Issue #%d）：%s', num, err.message);
    return html;
  }
}, 9);

module.exports = { normalizePath };
