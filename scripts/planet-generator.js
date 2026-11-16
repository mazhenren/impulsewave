/**
 * 星球数据生成器：构建期输出 /planet-issues.json（GitHub Issues 兼容格式），
 * 供 Stellar `{% timeline %}` 标签的 timeline 适配器消费（客户端 fetch 同源静态文件，无 API 限流）。
 *
 * 交互计数（评论/点赞）与置顶/精华标记来自 tools/sync-planet.mjs 写入的 source/_data/planet-meta.json。
 *
 * 注意：locals.posts 已被 scripts/planet-isolation.js 过滤为「仅博客文章」，
 * 星球帖必须直接从 Post 模型读取，否则本文件会输出空数组。
 */
'use strict';

const CAT_COLORS = {
  '股票': '0E8A16',
  '期货': '1D76DB',
  '外汇': '006B75',
  '技术分析': 'B60205',
  '交易笔记': '2E7D32'
};

hexo.extend.generator.register('planet-issues', function (locals) {
  const arr = q => {
    if (!q) return [];
    const list = typeof q.toArray === 'function' ? q.toArray() : (q.data || []);
    return list.map(x => x.name);
  };

  // 数据文件 source/_data/planet-meta.json 在 Hexo 中的键名是带连字符的 'planet-meta'，
  // 驼峰形式 'planetMeta' 仅作兼容兜底（取不到会丢失置顶/精华/互动计数）
  const data = locals.data || (hexo.locals.get('data') || {});
  const metaData = data['planet-meta'] || data.planetMeta || {};
  const metaList = metaData.issues || [];
  const metaMap = new Map(metaList.map(i => [i.number, i]));

  const siteBase = this.config.url.replace(/\/$/, '');
  const authorName = this.config.author;

  const items = [];
  // 直接读原始 Post 模型：星球帖不在 locals.posts 中
  this.model('Post').find({ published: true }).each(p => {
    if (!p.source || !/_posts[\\/]planet-\d+\.md$/.test(p.source)) return;
    const num = parseInt(p.source.match(/planet-(\d+)\.md$/)[1], 10);
    const meta = metaMap.get(num) || {};
    const link = siteBase + '/posts/' + (p.abbrlink || '') + '/';
    const labels = [];
    arr(p.categories).forEach(c => labels.push({ name: c, color: CAT_COLORS[c] || '1283C3' }));
    arr(p.tags).forEach(t => labels.push({ name: '# ' + t, color: '1283C3' }));
    if (meta.featured) labels.push({ name: '★ 精华', color: 'FBCA04' });
    if (meta.pinned) labels.push({ name: '📌 置顶', color: 'D93F0B' });

    // body 为原始 Markdown（Stellar 客户端用 marked 解析），正文完整内联展示。
    // 信息流按知识星球式布局：不显示标题、不在帖内附加版权行（版权见站点页脚与文章页）
    const body = (p._content || '').trim();

    items.push({
      // GitHub Issue 编号：planet-enhance.js 用它做 utterances issue-number 映射（评论直连原 Issue）
      number: num,
      title: p.title || '',
      body: body,
      created_at: p.date ? p.date.toISOString() : '',
      updated_at: meta.updated || '',
      html_url: link,
      user: {
        login: authorName,
        avatar_url: siteBase + '/images/avatar.jpg',
        html_url: siteBase + '/about/'
      },
      labels: labels,
      reactions: { total_count: meta.reactions || 0 },
      comments: meta.comments || 0,
      // 置顶标记：planet-enhance.js 据此把置顶帖抽到页面顶部独立置顶区
      pinned: !!meta.pinned
    });
  });

  // 置顶前置，其余按发布时间倒序
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return { path: 'planet-issues.json', data: JSON.stringify(items) };
});
