/**
 * 文章页浏览量徽章：插入到 Stellar 文章页底部"许可"区块末尾。
 * 仅在有 #license 区块的页面（文章页）执行；按页面路径独立计数。
 */
(function () {
  'use strict';
  function init() {
    var lic = document.getElementById('license');
    if (!lic) return;
    var body = lic.querySelector('.body');
    if (!body || body.querySelector('.planet-badge')) return;
    var img = document.createElement('img');
    img.className = 'planet-badge';
    img.src = 'https://visitor-badge.laobi.icu/badge?page_id=' +
      encodeURIComponent('mazhenren.impulsewave' + location.pathname) +
      '&left_text=%E6%B5%8F%E8%A7%88%E9%87%8F&left_color=%23595959&right_color=%231283c3';
    img.alt = '浏览量';
    img.style.height = '18px';
    img.style.verticalAlign = 'middle';
    img.referrerPolicy = 'no-referrer-when-downgrade';
    body.appendChild(img);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
