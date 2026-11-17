/**
 * 站点统计（页脚）：运行时间 + 访问量 + 累计字数。
 *
 * 主题的 footer.content 只支持静态 Markdown，拿不到构建期的字数汇总，
 * 因此在 after_render:html 阶段往 <footer class="page-footer"> 里注入一块统计区：
 *   1. 总访问 / 本页访问：不蒜子（busuanzi），请求失败时脚本会自行隐藏容器
 *   2. 运行时间 + 篇数 + 累计字数：每秒刷新运行时间
 *
 * 累计字数取自 hexo-symbols-count-time 写入的 post.length（已剔除 HTML 标签）。
 */
'use strict';

/** 站点上线时间（UTC 毫秒）：2026-11-12 00:00（东八区） */
const SITE_START_MS = Date.UTC(2026, 10, 11, 16, 0, 0);

let stats = { posts: 0, words: 0 };

/** 与 hexo-symbols-count-time 相同的缩写规则：<999 原样，<9999 → 1.1k，其余 → 11k */
function formatWords(n) {
  if (n > 9999) return `${Math.round(n / 1000)}k`;
  if (n > 999) return `${Math.round(n / 100) / 10}k`;
  return String(n);
}

hexo.on('generateBefore', () => {
  try {
    let posts = 0;
    let words = 0;
    hexo.locals.get('posts').each(post => {
      posts += 1;
      words += Number(post.length) || 0;
    });
    stats = { posts, words };
  } catch (err) {
    hexo.log.warn('[site-stats] 汇总字数失败：%s', err.message);
  }
});

function buildStats() {
  const summary = `共 ${stats.posts} 篇 · 总计 ${formatWords(stats.words)} 字`;
  const script = [
    '<script>(function(){',
    `var t0=${SITE_START_MS};`,
    "var s=document.getElementById('runtime_span');if(!s)return;",
    'var Y=31536000000,D=86400000,H=3600000,M=60000;',
    'function tick(){var d=Math.max(0,Date.now()-t0),',
    'y=Math.floor(d/Y),rd=d-y*Y,dd=Math.floor(rd/D);rd-=dd*D;',
    'var h=Math.floor(rd/H);rd-=h*H;var m=Math.floor(rd/M),sec=Math.floor((rd-m*M)/1000);',
    `s.textContent='已运行 '+y+' 年 '+dd+' 天 '+h+' 小时 '+m+' 分 '+sec+' 秒 · ${summary}';}`,
    'tick();setInterval(tick,1000);})();</script>'
  ].join('');

  return [
    '<div class="site-stats">',
    '<span id="busuanzi_container_site_pv">总访问 ',
    '<span id="busuanzi_value_site_pv" class="stat-num">-</span> 次</span>',
    '<span class="stat-sep">|</span>',
    '<span id="busuanzi_container_page_pv">本页访问 ',
    '<span id="busuanzi_value_page_pv" class="stat-num">-</span> 次</span>',
    '<br>',
    `<span id="runtime_span">${summary}</span>`,
    '</div>',
    '<script async src="//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"></script>',
    script
  ].join('');
}

hexo.extend.filter.register('after_render:html', function (html) {
  if (typeof html !== 'string' || !html) return html;
  if (html.indexOf('page-footer') === -1) return html;
  // 幂等：已注入则跳过
  if (html.indexOf('class="site-stats"') !== -1) return html;
  const marker = /<footer class="page-footer[^"]*">\s*<hr>/i;
  if (!marker.test(html)) return html;
  return html.replace(marker, m => m + buildStats());
}, 11);
