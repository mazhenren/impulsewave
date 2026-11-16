/**
 * 星球数据生成器：构建期输出 /planet-issues.json（GitHub Issues 兼容格式），
 * 供 Stellar `{% timeline %}` 标签的 timeline 适配器消费（客户端 fetch 同源静态文件，无 API 限流）。
 * 交互计数（评论/点赞）来自 tools/sync-planet.mjs 写入的 source/_data/planet-meta.json。
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

  const metaList = (locals.data && locals.data.planetMeta && locals.data.planetMeta.issues) ||
    (hexo.locals.data && hexo.locals.data.planetMeta && hexo.locals.data.planetMeta.issues) || [];
  const metaMap = new Map(metaList.map(i => [i.number, i]));

  const siteBase = this.config.url.replace(/\/$/, '');
  const authorName = this.config.author;

  const items = [];
  locals.posts.each(p => {
    if (!p.planet) return;
    const meta = metaMap.get(p.planet.issue) || {};
    const link = siteBase + '/posts/' + (p.abbrlink || '') + '/';
    const labels = [];
    arr(p.categories).forEach(c => labels.push({ name: c, color: CAT_COLORS[c] || '1283C3' }));
    arr(p.tags).forEach(t => labels.push({ name: '# ' + t, color: '1283C3' }));
    if (p.planet.featured) labels.push({ name: '★ 精华', color: 'FBCA04' });
    if (p.planet.pinned) labels.push({ name: '📌 置顶', color: 'D93F0B' });

    // body 为原始 Markdown（Stellar 客户端用 marked 解析），末尾附讨论链接与版权行
    const body = [
      (p._content || '').trim(),
      '',
      `**阅读全文**：${link}`,
      `💬 [原帖讨论](https://github.com/${p.planet.url ? p.planet.url.replace('https://github.com/', '') : ''})`,
      '',
      '---',
      `本文由 ${authorName} 原创，采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 许可协议，转载请注明出处。`
    ].join('\n');

    items.push({
      title: p.title || '',
      body: body,
      created_at: p.date ? p.date.toISOString() : '',
      updated_at: p.planet.updated || '',
      html_url: link,
      user: {
        login: authorName,
        avatar_url: siteBase + '/images/avatar.jpg',
        html_url: siteBase + '/about/'
      },
      labels: labels,
      reactions: { total_count: meta.reactions || 0 },
      comments: meta.comments || 0,
      // 排序辅助字段（适配器忽略未知字段）
      _pinned: !!p.planet.pinned
    });
  });

  // 置顶前置，其余按发布时间倒序
  items.sort((a, b) => {
    if (a._pinned !== b._pinned) return a._pinned ? -1 : 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  items.forEach(i => { delete i._pinned; });

  return { path: 'planet-issues.json', data: JSON.stringify(items) };
});
