/* 在评论区标题右侧插入阅读量节点，供 Waline 的 pageview 选项更新 */
(function () {
  'use strict';

  function inject() {
    var title = document.querySelector('#comments .cmt-title');
    if (!title || title.querySelector('.waline-pageview-count')) return;

    var meta = document.createElement('span');
    meta.className = 'cmt-pageview';
    meta.appendChild(document.createTextNode('阅读量 '));

    var count = document.createElement('span');
    count.className = 'waline-pageview-count';
    count.textContent = '--';

    meta.appendChild(count);
    title.appendChild(meta);
  }

  function boot() {
    inject();
    if ('MutationObserver' in window) {
      new MutationObserver(inject).observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('pageshow', inject);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
