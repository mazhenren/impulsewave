/**
 * 星球动态数据生成器：构建期输出 /planet-feed.json（博客文章原生结构）。
 *
 * 与旧版 planet-issues.json 的区别：
 * - 不再照搬 GitHub Issue 字段（user/labels/html_url/created_at），改用博客文章语义：
 *   title / url / date / html / tags / pinned / featured / comments / reactions
 * - source 字段保存来源关联（github-issue + Issue 编号 + 原文链接），供前端展示徽标、
 *   并在排查时把一条动态准确回溯到原 Issue
 * - 正文在构建期用 Hexo 渲染成 HTML（p.content），前端不再依赖 marked 二次解析
 * - number 仅用于把评论映射回原 Issue（Utterances issue-number），不是内容来源
 *
 * 交互计数（评论/点赞）与置顶/精华标记来自 tools/sync-planet.mjs 写入的 source/_data/planet-meta.json。
 * 注意：Hexo 加载 _data 时键名保留连字符，必须读 'planet-meta'。
 *
 * locals.posts 已被 scripts/planet-isolation.js 过滤为「仅博客文章」，
 * 星球帖必须直接从 Post 模型读取，否则本文件会输出空数组。
 */
'use strict';

const { sourceInfo } = require('./planet-source');

// 标签项结构：{ name, type }，type 决定前端跳转的页面类型
// - category → /categories/<name>/
// - tag      → /tags/<name>/
// - badge    → 不生成链接（如「★ 精华」）
const TagUtils = {
  push(list, seen, name, type) {
    const label = String(name == null ? '' : name).trim();
    if (!label) return;
    const key = type + '\u0001' + label;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ name: label, type });
  }
};

hexo.extend.generator.register('planet-feed', function (locals) {
  const arr = q => {
    if (!q) return [];
    const list = typeof q.toArray === 'function' ? q.toArray() : (q.data || []);
    return list.map(x => x.name);
  };

  const data = locals.data || (hexo.locals.get('data') || {});
  const metaData = data['planet-meta'] || data.planetMeta || {};
  const metaList = metaData.issues || [];
  const metaMap = new Map(metaList.map(i => [i.number, i]));

  const siteBase = this.config.url.replace(/\/$/, '');
  const authorName = this.config.author;

  const posts = [];
  // 直接读原始 Post 模型：星球帖不在 locals.posts 中
  this.model('Post').find({ published: true }).each(p => {
    if (!p.source || !/_posts[\\/]planet-\d+\.md$/.test(p.source)) return;
    const num = parseInt(p.source.match(/planet-(\d+)\.md$/)[1], 10);
    if (!Number.isFinite(num)) return; // 编号异常：跳过而不是产出错链
    const meta = metaMap.get(num) || {};

    // 话题标签必须带类型：分类页在 /categories/<name>/，标签页在 /tags/<name>/，
    // 前端只有知道类型才能拼出正确地址（此前混在一起统一拼 /tags/ 导致 404）。
    const tags = [];
    const seen = new Set();
    arr(p.categories).forEach((name) => {
      TagUtils.push(tags, seen, name, 'category');
    });
    arr(p.tags).forEach((name) => {
      TagUtils.push(tags, seen, name, 'tag');
    });
    if (meta.featured) tags.push({ name: '★ 精华', type: 'badge' });

    // 链接以 Post 自身 path 为准（abbrlink 缺失时仍能生成有效地址）
    let rel = String(p.path || '').replace(/^\/+/, '');
    if (!rel) rel = 'plants/' + (p.abbrlink || num) + '/';
    if (!/\/$/.test(rel)) rel += '/';

    posts.push({
      // 仅用于文章页评论映射（Utterances issue-number），不参与内容渲染
      number: num,
      // 来源关联：来源类型 + 原 Issue 编号 + 原文链接，前端据此显示徽标并可追溯
      source: sourceInfo(num),
      title: p.title || '',
      url: siteBase + '/' + rel,
      date: p.date ? p.date.toISOString() : '',
      updated: p.updated ? p.updated.toISOString() : '',
      // 构建期已渲染的正文 HTML（图片路径已按 root 补全）
      html: p.content || '',
      tags: tags,
      pinned: !!meta.pinned,
      featured: !!meta.featured,
      comments: meta.comments || 0,
      reactions: meta.reactions || 0
    });
  });

  // 置顶前置，其余按发布时间倒序
  posts.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.date) - new Date(a.date);
  });

  const feed = {
    generated_at: new Date().toISOString(),
    author: {
      name: authorName,
      avatar: siteBase + '/images/avatar.jpg',
      url: siteBase + '/about/'
    },
    posts: posts
  };

  return { path: 'planet-feed.json', data: JSON.stringify(feed) };
});
