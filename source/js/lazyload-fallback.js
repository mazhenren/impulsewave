/**
 * 懒加载兜底：lazyload.min.js 加载失败时，把 img.lazy 的 data-src 直接换回 src。
 *
 * 背景：文章图片走主题懒加载，HTML 里是 <img class="lazy" src="1px 占位" data-src="真实图">。
 * 一旦 lazyload 脚本加载失败（第三方 CDN 超时、网络异常），data-src 永远不会被替换，
 * 页面表现为「文章图片全部空白」。正常路径由主题 runtime 动态加载 vanilla-lazyload
 * 并创建 lazyLoadInstance；这里每秒探测一次，最多 8 秒，确认脚本未就绪后：
 *   1. 立即显示当前所有 img.lazy[data-src]（补上 entered/loaded 类，与 lazyload 行为一致）
 *   2. 用 MutationObserver 兜住之后动态插入的图片（如信息流卡片）
 */
(function () {
  function reveal(img) {
    if (!img || img.tagName !== 'IMG') return;
    var real = img.getAttribute('data-src');
    if (!real) return;
    // 交给浏览器原生懒加载，保持滚动到可视区域才真正拉取
    if ('loading' in img) img.loading = 'lazy';
    img.src = real;
    img.removeAttribute('data-src');
    img.classList.remove('lazy');
    img.classList.add('entered', 'loaded');
  }

  function revealIn(root) {
    if (!root || !root.querySelectorAll) return;
    var imgs = root.querySelectorAll('img.lazy[data-src]');
    for (var i = 0; i < imgs.length; i++) reveal(imgs[i]);
  }

  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (window.LazyLoad || window.lazyLoadInstance || tries >= 8) {
      clearInterval(timer);
      // 脚本已就绪：走正常懒加载路径，不做任何干预
      if (window.LazyLoad || window.lazyLoadInstance) return;

      revealIn(document);
      var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (node.nodeType !== 1) continue;
            if (node.tagName === 'IMG') reveal(node);
            else revealIn(node);
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }, 1000);
})();
