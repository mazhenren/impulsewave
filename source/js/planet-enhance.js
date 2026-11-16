/**
 * 星球动态增强：基于 Stellar 原生 {% timeline %} 的客户端扩展，无第三方依赖。
 *
 * 信息流页（.ds-timeline 存在）：
 *   1. 话题标签筛选栏：按 planet-issues.json 聚合统计，单选筛选 + 「全部」重置
 *   2. 长动态折叠：.body 高度 > 320px 自动折叠，展开/收起平滑过渡
 *   （卡片内不再挂评论框，讨论入口只在文章页）
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

  /* ============ 模块 1：卡片结构（星球式头部 / 操作栏 / 图片网格） ============ */

  var ICONS = {
    like: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3z"/><path d="M7 10l4.5-6.5a2 2 0 0 1 3.4 2L14 9h5.2a2 2 0 0 1 2 2.4l-1.4 7a2 2 0 0 1-2 1.6H7"/></svg>',
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v13"/><path d="M8 7l4-4 4 4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
  };

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function setupCard(node, item) {
    // 置顶帖在顶部置顶区展示，信息流里隐藏（timeline 客户端渲染晚于置顶区生成，此处兜底）
    if (item.pinned) {
      node.classList.add('planet-pinned-hidden');
      return;
    }
    if (node.dataset.cardInit) return;
    node.dataset.cardInit = '1';

    // 时间改成星球式 YYYY-MM-DD HH:mm（主题默认是受 locale 影响的完整格式）
    // 注意：header 里第一个 span 是 user-info 内的作者名，必须取直接子级的时间 span
    var header = node.querySelector('.header');
    var dateEl = header ? header.querySelector(':scope > span') : null;
    if (dateEl) dateEl.textContent = formatDate(item.created_at);

    var body = node.querySelector('.body');
    if (!body) return;

    // 多图九宫格：同一段落里 2 张以上图片改网格
    body.querySelectorAll('p').forEach(function (p) {
      if (p.querySelectorAll('img').length >= 2) p.classList.add('planet-gallery');
    });

    var link = item.html_url;
    var bar = document.createElement('div');
    bar.className = 'planet-actions';

    var like = document.createElement('button');
    like.type = 'button';
    like.className = 'planet-act';
    like.title = '赞';
    var likeCount = item.reactions && item.reactions.total_count > 0 ? item.reactions.total_count : 0;
    like.innerHTML = ICONS.like + (likeCount ? '<span>' + likeCount + '</span>' : '');

    // 评论与「查看详情」都落到文章页，评论区为直连原 Issue 的 utterances
    var comment = document.createElement('a');
    comment.className = 'planet-act';
    comment.href = link + '#comments';
    comment.title = '评论';
    comment.innerHTML = ICONS.comment;

    var share = document.createElement('button');
    share.type = 'button';
    share.className = 'planet-act';
    share.title = '复制链接';
    share.innerHTML = ICONS.share;
    share.addEventListener('click', function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(link).then(function () {
        share.innerHTML = ICONS.share + '<span>已复制</span>';
        setTimeout(function () { share.innerHTML = ICONS.share; }, 1500);
      });
    });

    var more = document.createElement('a');
    more.className = 'planet-act planet-more';
    more.href = link;
    more.innerHTML = '查看详情' + ICONS.arrow;

    bar.appendChild(like);
    bar.appendChild(comment);
    bar.appendChild(share);
    bar.appendChild(more);
    node.appendChild(bar);
  }

  function renderPinned(timeline, feed) {
    if (timeline.parentNode.querySelector('.planet-pinned')) return;

    var pinned = [];
    feed.forEach(function (item, i) {
      if (!item.pinned) return;
      pinned.push(item);
      var node = timeline.querySelector('.timenode[index="' + i + '"]');
      if (node) node.classList.add('planet-pinned-hidden');
    });
    if (!pinned.length) return;

    var box = document.createElement('div');
    box.className = 'planet-pinned';
    pinned.forEach(function (item) {
      var row = document.createElement('a');
      row.className = 'planet-pin-row';
      row.href = item.html_url;

      var badge = document.createElement('span');
      badge.className = 'planet-pin-badge';
      badge.textContent = '置顶';

      var text = document.createElement('span');
      text.className = 'planet-pin-text';
      text.textContent = item.title || '（无标题）';

      row.appendChild(badge);
      row.appendChild(text);
      box.appendChild(row);
    });
    timeline.parentNode.insertBefore(box, timeline);
  }

  /* ============ 模块 2：话题标签筛选栏 ============ */

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
      if (item.pinned) return; // 置顶帖在顶部置顶区，不参与筛选计数
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

    var total = feed.filter(function (i) { return !i.pinned; }).length;
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
        if (node.classList.contains('planet-pinned-hidden')) return;
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

  /* ============ 模块 3：长动态折叠 ============ */

  function setupCollapse(node) {
    if (node.classList.contains('planet-pinned-hidden')) return;
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
          // 展开按钮放在操作栏上方，操作栏始终贴在卡片底部
          var actions = node.querySelector('.planet-actions');
          if (actions) node.insertBefore(btn, actions); else node.appendChild(btn);
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

  /* ============ 模块 3：评论区挂载（仅文章页使用） ============ */

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

  /* ============ 信息流页入口 ============ */

  function initTimeline() {
    var timeline = document.querySelector('.ds-timeline[data-api]');
    if (!timeline) return;

    var feed = null;

    // 幂等增强：setupCard / setupCollapse 均有防重保护
    function enhanceAll() {
      if (!feed) return;
      timeline.querySelectorAll('.timenode').forEach(function (n) {
        var idx = parseInt(n.getAttribute('index'), 10);
        var item = isNaN(idx) ? null : feed[idx];
        if (item) setupCard(n, item);
        setupCollapse(n);
      });
    }

    // 数据就绪后输出置顶区、构建筛选栏并首次增强；同时轮询兜底——
    // 主题 timeline service 的 fetch 渲染时机与本脚本无序，MutationObserver 无法覆盖所有竞态窗口
    loadFeed().then(function (data) {
      feed = data;
      if (feed && feed.length) {
        renderPinned(timeline, feed);
        buildFilter(timeline, feed);
      }
      enhanceAll();
      var started = Date.now();
      var timer = setInterval(function () {
        enhanceAll();
        // 所有卡片都完成折叠探测后停止轮询
        var pending = timeline.querySelectorAll('.timenode:not([data-collapse-init])').length;
        if (pending === 0 || Date.now() - started > 15000) clearInterval(timer);
      }, 400);
    });

    // 观察者处理轮询间隙外的增量插入（如后续翻页/动态追加）
    var observer = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1 || !n.classList.contains('timenode')) return;
          var idx = parseInt(n.getAttribute('index'), 10);
          if (feed && !isNaN(idx) && feed[idx]) setupCard(n, feed[idx]);
          setupCollapse(n);
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
