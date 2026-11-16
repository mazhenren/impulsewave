/**
 * 星球动态：客户端渲染 + 交互增强，无第三方依赖。
 *
 * 数据源是构建期生成的 /planet-feed.json（博客文章结构：title/url/date/html/tags/pinned），
 * 不再使用 Stellar 的 GitHub Issues timeline service。
 *
 * 信息流页（.planet-feed[data-api] 存在）：
 *   1. 渲染星球式卡片：左头像、橙色作者名、灰色时间、正文、标签、底部操作栏
 *      - 每条动态带 data-planet-source / data-issue-number，头部 #N 徽标直达原 Issue
 *   2. 顶部置顶区：置顶帖从信息流抽出，单行截断展示
 *   3. 话题标签筛选栏：按 tags 聚合统计，单选筛选 + 「全部」重置
 *   4. 长动态折叠：.body 高度 > 320px 自动折叠，展开/收起平滑过渡
 *
 * 文章页（路径命中 planet-feed.json 中的文章链接）：
 *   5. 评论区统一映射回原 Issue：已有 #utterances 时改属性（零竞态），否则注入新评论区
 */
(function () {
  'use strict';

  var REPO = 'mazhenren/impulsewave';
  var SITE_BASE = 'https://mazhenren.github.io/impulsewave';
  var COLLAPSE_HEIGHT = 320;
  var UTTERANCES_THEME = 'preferred-color-scheme';

  var feedPromise = null;
  function loadFeed() {
    if (!feedPromise) {
      var el = document.querySelector('.planet-feed[data-api]');
      var url = el ? el.dataset.api : SITE_BASE + '/planet-feed.json';
      feedPromise = fetch(url)
        .then(function (r) { return r.json(); })
        .catch(function () { return null; });
    }
    return feedPromise;
  }

  /* ============ 基础工具 ============ */

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

  /* ============ 模块 1：卡片渲染 ============ */

  function buildActions(item) {
    var bar = document.createElement('div');
    bar.className = 'planet-actions';

    var like = document.createElement('button');
    like.type = 'button';
    like.className = 'planet-act';
    like.title = '赞';
    var likeCount = item.reactions > 0 ? item.reactions : 0;
    like.innerHTML = ICONS.like + (likeCount ? '<span>' + likeCount + '</span>' : '');

    // 评论与「查看详情」都落到文章页，评论区为直连原帖的 utterances
    var comment = document.createElement('a');
    comment.className = 'planet-act';
    comment.href = item.url + '#comments';
    comment.title = '评论';
    comment.innerHTML = ICONS.comment;

    var share = document.createElement('button');
    share.type = 'button';
    share.className = 'planet-act';
    share.title = '复制链接';
    share.innerHTML = ICONS.share;
    share.addEventListener('click', function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(item.url).then(function () {
        share.innerHTML = ICONS.share + '<span>已复制</span>';
        setTimeout(function () { share.innerHTML = ICONS.share; }, 1500);
      });
    });

    var more = document.createElement('a');
    more.className = 'planet-act planet-more';
    more.href = item.url;
    more.innerHTML = '查看详情' + ICONS.arrow;

    bar.appendChild(like);
    bar.appendChild(comment);
    bar.appendChild(share);
    bar.appendChild(more);
    return bar;
  }

  function buildPost(item, author) {
    var node = document.createElement('div');
    node.className = 'timenode';
    node.dataset.labels = (item.tags || []).join('\u0001');

    // 来源关联：数据来自构建期 planet-generator.js 注入的 source 字段
    var source = item.source && item.source.type === 'github-issue' ? item.source : null;
    if (source && source.number != null) {
      node.dataset.planetSource = 'github-issue';
      node.dataset.issueNumber = String(source.number);
    }

    var header = document.createElement('div');
    header.className = 'header';

    var user = document.createElement('a');
    user.className = 'user-info';
    user.href = author.url || SITE_BASE + '/about/';
    var avatar = document.createElement('img');
    avatar.src = author.avatar || SITE_BASE + '/images/avatar.jpg';
    avatar.alt = author.name || '';
    var name = document.createElement('span');
    name.textContent = author.name || '';
    user.appendChild(avatar);
    user.appendChild(name);

    var time = document.createElement('span');
    time.textContent = formatDate(item.date);

    header.appendChild(user);

    // 可追溯的原帖入口：点徽标直接回到生成这条动态的 GitHub Issue
    if (source && source.number != null) {
      var issue = document.createElement('a');
      issue.className = 'planet-issue-link';
      issue.href = source.url || ('https://github.com/' + REPO + '/issues/' + source.number);
      issue.target = '_blank';
      issue.rel = 'external nofollow noopener noreferrer';
      issue.title = '来自 GitHub Issue #' + source.number;
      issue.textContent = '#' + source.number;
      header.appendChild(issue);
    }

    // 时间放在最后：CSS 让 .header > span 占满整行，形成「头像/来源 + 时间」两行结构
    header.appendChild(time);

    var body = document.createElement('div');
    body.className = 'body';

    // 标题保留在 DOM 里供 CSS 隐藏（星球信息流不显示标题）
    var title = document.createElement('p');
    title.className = 'title';
    var titleLink = document.createElement('a');
    titleLink.href = item.url;
    titleLink.textContent = item.title || '';
    title.appendChild(titleLink);
    body.appendChild(title);

    var content = document.createElement('div');
    content.className = 'planet-content';
    content.innerHTML = item.html || '';
    body.appendChild(content);

    if (item.tags && item.tags.length) {
      var footer = document.createElement('div');
      footer.className = 'footer';
      var left = document.createElement('div');
      left.className = 'flex left';
      item.tags.forEach(function (tag) {
        var chip = document.createElement('div');
        chip.className = 'item label';
        var text = document.createElement('span');
        text.textContent = tag;
        chip.appendChild(text);
        left.appendChild(chip);
      });
      footer.appendChild(left);
      body.appendChild(footer);
    }

    node.appendChild(header);
    node.appendChild(body);
    node.appendChild(buildActions(item));
    return node;
  }

  function renderPinned(container, pinned) {
    var box = document.createElement('div');
    box.className = 'planet-pinned';
    pinned.forEach(function (item) {
      var row = document.createElement('a');
      row.className = 'planet-pin-row';
      row.href = item.url;

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
    container.parentNode.insertBefore(box, container);
  }

  /* ============ 模块 2：话题标签筛选栏 ============ */

  function buildFilter(container, posts) {
    var counts = {};
    posts.forEach(function (item) {
      (item.tags || []).forEach(function (name) {
        if (/^[★📌]/.test(name)) return;
        counts[name] = (counts[name] || 0) + 1;
      });
    });
    var names = Object.keys(counts);
    if (!names.length) return;

    var bar = document.createElement('div');
    bar.className = 'planet-filter';

    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'planet-chip active';
    all.textContent = '全部 ' + posts.length;
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
      container.querySelectorAll('.timenode').forEach(function (node) {
        var labels = (node.dataset.labels || '').split('\u0001');
        var show = !selected || labels.indexOf(selected) !== -1;
        node.style.display = show ? '' : 'none';
      });
      bar.querySelectorAll('.planet-chip').forEach(function (chip) {
        var active = selected
          ? chip.dataset.label === selected
          : !chip.dataset.label;
        chip.classList.toggle('active', active);
      });
    }

    bar.addEventListener('click', function (e) {
      var chip = e.target.closest('.planet-chip');
      if (!chip) return;
      apply(chip.dataset.label || null); // 「全部」无 data-label → 重置
    });

    container.parentNode.insertBefore(bar, container);
  }

  /* ============ 模块 3：长动态折叠 ============ */

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

  /* ============ 模块 4：评论区挂载（仅文章页使用） ============ */

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

  function initFeed() {
    var container = document.querySelector('.planet-feed[data-api]');
    // 主题的部分导航可能重复执行初始化，加幂等保护避免重复渲染
    if (!container || container.dataset.rendered) return;
    container.dataset.rendered = '1';

    loadFeed().then(function (data) {
      // 数据缺失/格式异常：保留空容器，不影响页面其余部分
      if (!data || !Array.isArray(data.posts) || !data.posts.length) return;
      var author = data.author || {};
      var pinned = data.posts.filter(function (p) { return p && p.pinned; });
      var list = data.posts.filter(function (p) { return p && !p.pinned; });

      try {
        if (pinned.length) renderPinned(container, pinned);
        list.forEach(function (item) { container.appendChild(buildPost(item, author)); });
        if (list.length) buildFilter(container, list);

        // 主题懒加载扫描后注入的图片，需要手动接入
        if (typeof window.wrapLazyloadImages === 'function') {
          window.wrapLazyloadImages(container);
        }
        container.querySelectorAll('.timenode').forEach(setupCollapse);
      } catch (err) {
        container.dataset.rendered = 'error';
        if (window.console && console.warn) console.warn('[planet] 信息流渲染失败', err);
      }
    });
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
    loadFeed().then(function (data) {
      if (!data || !Array.isArray(data.posts)) return;
      var path = location.pathname.replace(/index\.html$/, '');
      var item = null;
      try {
        for (var i = 0; i < data.posts.length; i++) {
          var u = data.posts[i] && data.posts[i].url;
          if (u && new URL(u).pathname === path) { item = data.posts[i]; break; }
        }
      } catch (err) {
        if (window.console && console.warn) console.warn('[planet] 文章匹配失败', err);
        return;
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
    if (document.querySelector('.planet-feed[data-api]')) {
      initFeed();
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
