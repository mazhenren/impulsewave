/* 在评论区标题右侧插入阅读量节点，并自行读取 Waline 计数
 *
 * 注意：Waline 的 pageview 只在初始化时更新页面中已存在的
 * .waline-pageview-count 节点。本文件注入节点的时间点与 Waline
 * 初始化存在竞争，节点可能晚于 Waline 的更新，从而一直停在占位符。
 * 因此这里注入后主动读取 /api/article?type=time（只读，不重复计数）。
 */
(function () {
  'use strict';

  var SERVER_URL = 'https://waline-on-worker.ihuige-waline.workers.dev';
  var MAX_TRIES = 5;
  var RETRY_DELAY = 1200;

  function readCount() {
    var path = window.location.pathname;
    return fetch(SERVER_URL + '/api/article?path=' + encodeURIComponent(path) + '&type=time', {
      headers: { Accept: 'application/json' }
    })
      .then(function (res) { return res.json(); })
      .then(function (res) {
        var row = res && res.errno === 0 && Array.isArray(res.data) ? res.data[0] : null;
        return row && typeof row.time === 'number' ? row.time : null;
      })
      .catch(function () { return null; });
  }

  function fill(node, tries) {
    if (tries <= 0) return;
    readCount().then(function (count) {
      if (count === null) {
        setTimeout(function () { fill(node, tries - 1); }, RETRY_DELAY);
        return;
      }
      node.textContent = String(count);
    });
  }

  function inject() {
    var title = document.querySelector('#comments .cmt-title');
    if (!title) return;
    var count = title.querySelector('.waline-pageview-count');
    if (!count) {
      var meta = document.createElement('span');
      meta.className = 'cmt-pageview';
      meta.appendChild(document.createTextNode('阅读量 '));

      count = document.createElement('span');
      count.className = 'waline-pageview-count';
      count.textContent = '--';

      meta.appendChild(count);
      title.appendChild(meta);
    }
    // 占位符仍在时（Waline 未更新到该节点）主动补齐
    if (count.textContent === '--' || count.textContent === '') {
      fill(count, MAX_TRIES);
    }
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
