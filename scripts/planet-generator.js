/**
 * 星球数据生成器：构建期读取带 planet 字段的文章，输出 public/planet-data.json
 * 交互计数（评论/点赞）来自 tools/sync-planet.mjs 写入的 source/_data/planet-meta.json
 */
'use strict';

hexo.extend.generator.register('planet-data', function (locals) {
  const arr = q => {
    if (!q) return [];
    const list = typeof q.toArray === 'function' ? q.toArray() : (q.data || []);
    return list.map(x => x.name);
  };

  const metaList = (locals.data && locals.data.planetMeta && locals.data.planetMeta.issues) ||
    (hexo.locals.data && hexo.locals.data.planetMeta && hexo.locals.data.planetMeta.issues) || [];
  const metaMap = new Map(metaList.map(i => [i.number, i]));

  const items = [];
  locals.posts.each(p => {
    if (!p.planet) return;
    const meta = metaMap.get(p.planet.issue) || {};
    items.push({
      title: p.title || '',
      date: p.date ? p.date.toISOString() : '',
      updated: p.planet.updated || '',
      description: p.description || '',
      categories: arr(p.categories),
      tags: arr(p.tags),
      pinned: !!p.planet.pinned,
      featured: !!p.planet.featured,
      issue: p.planet.issue,
      url: p.planet.url || '',
      link: '/posts/' + (p.abbrlink || '') + '/',
      comments: meta.comments || 0,
      reactions: meta.reactions || 0,
      cover: p.cover || ''
    });
  });

  items.sort((a, b) => new Date(b.date) - new Date(a.date));

  const cfg = this.config;
  const data = {
    site: {
      author: cfg.author,
      title: cfg.title,
      avatar: cfg.url.replace(/\/$/, '') + '/images/avatar.jpg'
    },
    items
  };

  return { path: 'planet-data.json', data: JSON.stringify(data) };
});
