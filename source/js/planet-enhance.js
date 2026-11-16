/**
 * 星球动态增强：基于 Stellar 原生 {% timeline %} 的客户端扩展，无第三方依赖。
 *
 * 信息流页（.ds-timeline 存在）：
 *   1. 话题标签筛选栏：按 planet-issues.json 聚合统计，单选筛选 + 「全部」重置
 *   2. 长动态折叠：.body 高度 > 320px 自动折叠，展开/收起平滑过渡
 *   3. 卡片内评论：按 JSON 下标取 Issue 编号，utterances issue-number 直连原 Issue（懒加载）
 *
 * 文章页（路径命中 planet-issues.json 中的文章链接）：
 *   4. 评论区统一映射回原 Issue：已有 #utterances 时改属性（零竞态），否则注入新评论区
 */
(function () {
  'use strict';

  var REPO = 'mazhenren/impulsewave';
  var SITE_BASE = 'https://mazhenren.github.io/impulsewave';
  var COLLAPSE_HEIGHT = 320;
  var UTTERANCES_THEME = 'preferred-color-scheme';

  var jsonPromise = null;
  function loadFeed() {
    if (!jsonPromise) {
      var apiEl = document.querySelector('.ds-timeline[data-api]');
      var url = apiEl ? apiEl.dataset.api : '/impulsewave/planet-issues.json';
      jsonPromise = fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (d) { return d.content || d; })
        .catch(function () { return null; });
    }
    return jsonPromise;
  }

  /* ============ 模块 1：话题标签筛选栏 ============ */

  function nodeLabels(node) {
    // 卡片 DOM 中的标签文本（分类 + # 标签），装饰标签（★/📌）不参与筛选
    var spans = node.querySelectorAll('.body .footer .item.label span');
    var out = [];
    spans.forEach(function (s) {
      var t = s.textContent.trim();
      if (t && !/^[★📌]/.test(t)) out.push(t);
    });
    return out;
  }

  function buildFilter(timeline, feed) {
    var counts = {};
    feed.forEach(function (item) {
      (item.labels || []).forEach(function (l) {
        var name = l.name;
        if (/^[★📌]/.test(name)) return;
        counts[name] = (counts[name] || 0) + 1;
      });
    });
    var names = Object.keys(counts);
    if (!names.length) return;

    var bar = document.createElement('div');
    bar.className = 'planet-filter';

    var total = feed.length;
    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'planet-chip active';
    all.textContent = '全部 ' + total;
    bar.appendChild(all);

    names.forEach(function (name) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'planet-chip';
      chip.dataset.label = name;
      chip.textContent = name + ' ' + counts[name];
      bar.appendChild(chip);
    });

    function apply(selected) {
      var nodes = timeline.querySelectorAll('.timenode');
      nodes.forEach(function (node) {
        var labels = nodeLabels(node);
        var show = !selected || labels.indexOf(selected) !== -1;
        node.style.display = show ? '' : 'none';
      });
      bar.querySelectorAll('.planet-chip').forEach(function (chip) {
        var active = selected
          ? chip.dataset.label === selected
          : chip.classList.contains('planet-chip') && !chip.dataset.label;
        chip.classList.toggle('active', active);
      });
    }

    bar.addEventListener('click', function (e) {
      var chip = e.target.closest('.planet-chip');
      if (!chip) return;
      apply(chip.dataset.label || null); // 「全部」无 data-label → 重置
    });

    timeline.parentNode.insertBefore(bar, timeline);
  }

  /* ============ 模块 2：长动态折叠 ============ */

  function setupCollapse(node) {
    var body = node.querySelector('.body');
    if (!body || node.dataset.collapseInit) return;
    node.dataset.collapseInit = '1';

    function measure() {
      if (body.dataset.userToggled) return;
      if (body.scrollHeight > COLLAPSE_HEIGHT) {
        node.classList.add('planet-collapsed');
        body.style.maxHeight = COLLAPSE_HEIGHT + 'px';
        if (!node.querySelector('.planet-expand')) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'planet-expand';
          btn.textContent = '展开全文';
          btn.addEventListener('click', function () { toggle(); });
          node.appendChild(btn);
        }
      }
    }

    function toggle() {
      body.dataset.userToggled = '1';
      var collapsed = node.classList.toggle('planet-collapsed');
      var btn = node.querySelector('.planet-expand');
      if (collapsed) {
        body.style.maxHeight = COLLAPSE_HEIGHT + 'px';
        btn.textContent = '展开全文';
      } else {
        // scrollHeight 不受 max-height 裁切影响，始终是内容完整高度
        body.style.maxHeight = body.scrollHeight + 'px';
        btn.textContent = '收起';
      }
    }

    // 展开态下图片加载完成会撑高，需同步更新 max-height
    body.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('load', function () {
        if (!node.classList.contains('planet-collapsed')) {
          body.style.maxHeight = body.scrollHeight + 'px';
        }
      });
    });

    // 图片懒加载完成后高度会变化，补测一次
    body.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) img.addEventListener('load', measure, { once: true });
    });
    measure();
    setTimeout(measure, 800); // 主题 lazyload 重排后兜底
  }

  /* ============ 模块 3：卡片内评论（utterances，懒加载） ============ */

  function mountUtterances(box, attrs) {
    var s = document.createElement('script');
    s.src = 'https://utteranc.es/client.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.setAttribute('repo', REPO);
    Object.keys(attrs).forEach(function (k) { s.setAttribute(k, attrs[k]); });
    s.setAttribute('theme', UTTERANCES_THEME);
    box.appendChild(s);
  }

  function lazyMount(box, attrs) {
    if (!('IntersectionObserver' in window)) {
      mountUtterances(box, attrs);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        io.disconnect();
        mountUtterances(box, attrs);
      }
    }, { rootMargin: '200px' });
    io.observe(box);
  }

  function setupCardComments(node, feed) {
    if (node.querySelector('.planet-comments')) return;
    var idx = parseInt(node.getAttribute('index'), 10);
    var item = feed && !isNaN(idx) ? feed[idx] : null;
    if (!item) return; // 无对应数据时保持原「💬 原帖讨论」跳转

    // issue-number 直连原 Issue；数据未更新时 fallback 为标题精确匹配
    var attrs = item.number
      ? { 'issue-number': String(item.number) }
      : (item.title ? { 'issue-term': item.title } : null);
    if (!attrs) return;

    var box = document.createElement('div');
    box.className = 'planet-comments';
    node.appendChild(box);
    lazyMount(box, attrs);
  }

  /* ============ 信息流页入口 ============ */

  function initTimeline() {
    var timeline = document.querySelector('.ds-timeline[data-api]');
    if (!timeline) return;

    var feed = null;

    // 幂等增强：对当前所有卡片执行折叠与评论挂载（setupCollapse/setupCardComments 均有防重保护）
    function enhanceAll() {
      if (!feed) return;
      var nodes = timeline.querySelectorAll('.timenode');
      nodes.forEach(function (n) {
        setupCollapse(n);
        setupCardComments(n, feed);
      });
    }

    // 数据就绪后构建筛选栏并首次增强；同时轮询兜底——
    // 主题 timeline service 的 fetch 渲染时机与本脚本无序，MutationObserver 无法覆盖所有竞态窗口
    loadFeed().then(function (data) {
      feed = data;
      if (feed && feed.length) buildFilter(timeline, feed);
      enhanceAll();
      var started = Date.now();
      var timer = setInterval(function () {
        enhanceAll();
        // 已挂载评论容器数 >= feed 条数（无 number 数据的除外）则停止轮询
        var mounted = timeline.querySelectorAll('.timenode .planet-comments').length;
        var expected = 0;
        feed.forEach(function (item) { if (item.number) expected++; });
        if (mounted >= expected || Date.now() - started > 15000) clearInterval(timer);
      }, 400);
    });

    // 观察者处理轮询间隙外的增量插入（如后续翻页/动态追加）
    var observer = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1 || !n.classList.contains('timenode')) return;
          setupCollapse(n);
          setupCardComments(n, feed);
        });
      });
    });
    observer.observe(timeline, { childList: true });
  }

  /* ============ 文章页：评论区统一映射回原 Issue ============ */

  function injectPostComments(anchor, item) {
    var wrap = document.createElement('div');
    wrap.className = 'related-wrap md-text planet-post-comments';
    wrap.innerHTML =
      '<section class="header cmt-title cap theme">快来参与讨论吧~</section>' +
      '<section class="body cmt-body utterances"><div class="planet-utterances"></div></section>';
    anchor.after(wrap);

    // 主题的 utterances.css 由其加载器注入，自建评论区需手动引入
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = SITE_BASE + '/css/comments/utterances.css';
    document.head.appendChild(link);

    var box = wrap.querySelector('.planet-utterances');
    var attrs = item.number
      ? { 'issue-number': String(item.number) }
      : { 'issue-term': item.title }; // 兜底：标题精确匹配
    lazyMount(box, attrs);
  }

  function initPostComments() {
    loadFeed().then(function (feed) {
      if (!feed) return;
      var path = location.pathname.replace(/index\.html$/, '');
      var item = null;
      for (var i = 0; i < feed.length; i++) {
        var u = feed[i].html_url;
        if (u && new URL(u).pathname === path) { item = feed[i]; break; }
      }
      if (!item) return;

      // 情况 A：主题默认评论区已渲染（存量文章 issue-term: pathname）→ 直接改映射属性，
      // 主题懒加载器执行时才复制属性，零竞态
      var el = document.querySelector('#comments #utterances');
      if (el) {
        el.removeAttribute('issue-term');
        el.setAttribute('issue-number', String(item.number));
        return;
      }

      // 情况 B：comments: false 无评论区（新同步文章）→ 在 #license 之后注入
      var anchor = document.getElementById('license');
      if (anchor) injectPostComments(anchor, item);
    });
  }

  /* ============ 入口 ============ */

  function init() {
    if (document.querySelector('.ds-timeline[data-api]')) {
      initTimeline();
    } else {
      initPostComments();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
