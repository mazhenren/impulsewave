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
 */
(function () {
  'use strict';

  var REPO = 'mazhenren/impulsewave';
  var SITE_BASE = 'https://mazhenren.github.io/impulsewave';
  // Waline 服务端（与 _config.stellar.yml 中的 comments.waline.serverURL 保持一致）
  var WALINE_API = 'https://waline-on-worker.ihuige-waline.workers.dev';
  var COLLAPSE_HEIGHT = 320;
  // 正文字符数阈值：与高度阈值满足任一条件即折叠（移动端/PC 使用同一套阈值）
  var COLLAPSE_CHARS = 200;

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

  /* ============ Waline 互动（卡片点赞 / 评论数） ============ */

  // 与文章页 Waline 使用同一路径，保证卡片与评论区数据互通
  function postPath(url) {
    try {
      return new URL(url, location.origin).pathname;
    } catch (err) {
      return url;
    }
  }

  function likedKey(path) {
    return 'planet-liked:' + path;
  }

  function isLiked(path) {
    try {
      return localStorage.getItem(likedKey(path)) === '1';
    } catch (err) {
      return false;
    }
  }

  function setLiked(path, liked) {
    try {
      if (liked) localStorage.setItem(likedKey(path), '1');
      else localStorage.removeItem(likedKey(path));
    } catch (err) {
      /* 隐私模式下忽略 */
    }
  }

  function setActCount(btn, count) {
    var span = btn.querySelector('span');
    if (!span) {
      span = document.createElement('span');
      btn.appendChild(span);
    }
    var value = Number(count) || 0;
    span.textContent = value > 0 ? String(value) : '';
    span.hidden = value <= 0;
  }

  function toggleLike(btn) {
    if (btn.disabled) return;
    var path = btn.dataset.path;
    if (!path) return;

    var liked = btn.classList.contains('is-liked');
    btn.disabled = true;

    fetch(WALINE_API + '/api/article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: path,
        type: 'reaction0',
        action: liked ? 'desc' : 'inc'
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (res) {
        if (!res || res.errno !== 0) throw new Error((res && res.errmsg) || 'request failed');
        var row = Array.isArray(res.data) ? res.data[0] : null;
        btn.classList.toggle('is-liked', !liked);
        setLiked(path, !liked);
        if (row && typeof row.reaction0 === 'number') setActCount(btn, row.reaction0);
      })
      .catch(function (err) {
        if (window.console && console.warn) console.warn('[planet] 点赞失败', err);
      })
      .then(function () { btn.disabled = false; });
  }

  // 批量读取 Waline 评论数与 reaction0（点赞数），避免每张卡片单独请求
  function hydrateWaline(container, items) {
    var paths = [];
    items.forEach(function (item) {
      var path = postPath(item.url);
      if (path && paths.indexOf(path) === -1) paths.push(path);
    });
    if (!paths.length) return;

    var commentButtons = {};
    var likeButtons = {};
    var viewLabels = {};
    container.querySelectorAll('.planet-act, .planet-views').forEach(function (btn) {
      var path = btn.dataset.path;
      if (!path) return;
      if (btn.classList.contains('planet-comment')) commentButtons[path] = btn;
      if (btn.classList.contains('planet-like')) likeButtons[path] = btn;
      if (btn.classList.contains('planet-views')) viewLabels[path] = btn;
    });

    fetch(WALINE_API + '/api/comment?type=count&url=' + encodeURIComponent(paths.join(',')))
      .then(function (res) { return res.json(); })
      .then(function (res) {
        if (!res || res.errno !== 0 || !Array.isArray(res.data)) return;
        paths.forEach(function (path, index) {
          if (commentButtons[path]) setActCount(commentButtons[path], res.data[index] || 0);
        });
      })
      .catch(function (err) {
        if (window.console && console.warn) console.warn('[planet] 评论数加载失败', err);
      });

    fetch(
      WALINE_API + '/api/article?path=' + encodeURIComponent(paths.join(',')) + '&type=time,reaction0'
    )
      .then(function (res) { return res.json(); })
      .then(function (res) {
        if (!res || res.errno !== 0 || !Array.isArray(res.data)) return;
        paths.forEach(function (path, index) {
          var row = res.data[index];
          if (likeButtons[path]) setActCount(likeButtons[path], (row && row.reaction0) || 0);
          if (viewLabels[path]) {
            var countEl = viewLabels[path].querySelector('.planet-views-count');
            if (countEl) countEl.textContent = String((row && row.time) || 0);
          }
        });
      })
      .catch(function (err) {
        if (window.console && console.warn) console.warn('[planet] 点赞数加载失败', err);
      });
  }

  /* ============ 模块 1：卡片渲染 ============ */

  function buildActions(item, author) {
    var bar = document.createElement('div');
    bar.className = 'planet-actions';

    var path = postPath(item.url);

    var like = document.createElement('button');
    like.type = 'button';
    like.className = 'planet-act planet-like';
    like.dataset.path = path;
    like.title = '赞';
    like.innerHTML = ICONS.like + '<span hidden></span>';
    if (isLiked(path)) like.classList.add('is-liked');
    like.addEventListener('click', function () { toggleLike(like); });

    // 评论落到文章页，评论数来自 Waline
    var comment = document.createElement('a');
    comment.className = 'planet-act planet-comment';
    comment.dataset.path = path;
    comment.href = item.url + '#comments';
    comment.title = '评论';
    comment.innerHTML = ICONS.comment + '<span hidden></span>';

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

    // 详情在当前页弹窗展示，不跳转；仍保留文章页作为可分享的固定链接
    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'planet-act planet-more';
    more.setAttribute('aria-haspopup', 'dialog');
    more.innerHTML = '查看详情' + ICONS.arrow;
    more.addEventListener('click', function () { openModal(item, author); });

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
    time.className = 'planet-time';
    time.textContent = formatDate(item.date);

    var views = document.createElement('span');
    views.className = 'planet-views';
    views.dataset.path = postPath(item.url);
    views.innerHTML = '· 阅读 <span class="planet-views-count">--</span>';

    var meta = document.createElement('span');
    meta.className = 'planet-meta';
    meta.appendChild(time);
    meta.appendChild(views);

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
    header.appendChild(meta);

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
    node.appendChild(buildActions(item, author));
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

    var content = body.querySelector('.planet-content') || body;

    // 截断判定：字符数阈值 或 渲染高度阈值，满足任一条件即折叠
    function needCollapse() {
      var text = (content.textContent || '').replace(/\s+/g, '');
      if (text.length > COLLAPSE_CHARS) return true;
      return body.scrollHeight > COLLAPSE_HEIGHT;
    }

    function ensureButton() {
      var btn = node.querySelector('.planet-expand');
      if (btn) return btn;
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'planet-expand';
      btn.textContent = '展开全文';
      btn.addEventListener('click', function () { toggle(); });
      // 展开按钮放在操作栏上方，操作栏始终贴在卡片底部
      var actions = node.querySelector('.planet-actions');
      if (actions) node.insertBefore(btn, actions); else node.appendChild(btn);
      return btn;
    }

    function collapse() {
      node.classList.add('planet-collapsed');
      body.style.maxHeight = COLLAPSE_HEIGHT + 'px';
      ensureButton().textContent = '展开全文';
    }

    function expand(userAction) {
      node.classList.remove('planet-collapsed');
      // scrollHeight 不受 max-height 裁切影响，始终是内容完整高度
      body.style.maxHeight = body.scrollHeight + 'px';
      var btn = node.querySelector('.planet-expand');
      if (btn) {
        btn.style.display = '';
        btn.textContent = '收起';
      }
      if (userAction) node.dataset.userToggled = '1';
    }

    // 自动测量：用户手动切换后不再改动其选择
    function measure() {
      var wanted = needCollapse();
      var btn = node.querySelector('.planet-expand');
      if (wanted) {
        ensureButton().style.display = '';
      }
      if (node.dataset.userToggled) return;
      if (wanted) {
        collapse();
      } else {
        node.classList.remove('planet-collapsed');
        body.style.maxHeight = '';
        if (btn) btn.style.display = 'none';
      }
    }

    function toggle() {
      if (node.classList.contains('planet-collapsed')) expand(true);
      else {
        node.dataset.userToggled = '1';
        collapse();
      }
    }

    // 视口变化后重新计算：未手动切换时按新尺寸重新判定，已展开时同步高度
    function relayout() {
      if (node.dataset.userToggled) {
        if (!node.classList.contains('planet-collapsed')) {
          body.style.maxHeight = body.scrollHeight + 'px';
        }
        return;
      }
      measure();
    }

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(relayout, 150);
    });
    window.addEventListener('orientationchange', relayout);

    // 展开态下图片加载完成会撑高，需同步更新 max-height
    body.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('load', function () {
        if (!node.classList.contains('planet-collapsed')) {
          body.style.maxHeight = body.scrollHeight + 'px';
        } else if (!node.dataset.userToggled) {
          measure();
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

  /* ============ 模块 4：详情弹窗（当前页展示，不跳转） ============ */

  var modal = null;
  var modalLastFocus = null;

  function ensureModal() {
    if (modal) return modal;
    var el = document.createElement('div');
    el.className = 'planet-modal';
    el.dataset.open = '0';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = [
      '<div class="planet-modal-mask"></div>',
      '<div class="planet-modal-panel" role="dialog" aria-modal="true" aria-label="动态详情">',
      '  <div class="planet-modal-head">',
      '    <img class="planet-modal-avatar" alt="">',
      '    <div class="planet-modal-meta">',
      '      <div class="planet-modal-author"></div>',
      '      <div class="planet-modal-sub"></div>',
      '    </div>',
      '    <button type="button" class="planet-modal-close" aria-label="关闭">×</button>',
      '  </div>',
      '  <h3 class="planet-modal-title"></h3>',
      '  <div class="planet-modal-body"></div>',
      '  <div class="planet-modal-foot"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(el);

    // 点击遮罩或关闭按钮关闭；面板内容区点击不关闭
    el.addEventListener('click', function (e) {
      if (e.target.classList && e.target.classList.contains('planet-modal-mask')) closeModal();
    });
    el.querySelector('.planet-modal-close').addEventListener('click', closeModal);
    // 捕获阶段监听：即使焦点落在弹窗内的链接/输入框，Esc 也能关闭
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.dataset.open === '1') closeModal();
    }, true);

    modal = el;
    return el;
  }

  function openModal(item, author) {
    try {
      var el = ensureModal();
      var a = author || {};
      var avatar = el.querySelector('.planet-modal-avatar');
      avatar.src = a.avatar || SITE_BASE + '/images/avatar.jpg';
      avatar.alt = a.name || '';

      el.querySelector('.planet-modal-author').textContent = a.name || '';
      var sub = el.querySelector('.planet-modal-sub');
      sub.textContent = formatDate(item.date);
      var source = item.source && item.source.type === 'github-issue' ? item.source : null;
      if (source && source.number != null) {
        var issue = document.createElement('a');
        issue.className = 'planet-issue-link';
        issue.href = source.url || ('https://github.com/' + REPO + '/issues/' + source.number);
        issue.target = '_blank';
        issue.rel = 'external nofollow noopener noreferrer';
        issue.title = '来自 GitHub Issue #' + source.number;
        issue.textContent = '#' + source.number;
        sub.appendChild(issue);
      }

      // 星球内容不展示文章标题（与信息流、文章页保持一致）
      el.querySelector('.planet-modal-title').style.display = 'none';

      var body = el.querySelector('.planet-modal-body');
      body.innerHTML = item.html || '<p>（正文为空）</p>';
      // 兜底：若图片带惰性属性，弹窗内直接加载，避免空白
      body.querySelectorAll('img').forEach(function (img) {
        var lazy = img.getAttribute('data-src');
        var src = img.getAttribute('src') || '';
        if (lazy && (!src || src.indexOf('data:image') === 0)) img.src = lazy;
      });

      var foot = el.querySelector('.planet-modal-foot');
      foot.innerHTML = '';
      (item.tags || []).forEach(function (tag) {
        var chip = document.createElement('span');
        chip.className = 'planet-modal-tag';
        chip.textContent = tag;
        foot.appendChild(chip);
      });
      var open = document.createElement('a');
      open.className = 'planet-modal-open';
      open.href = item.url;
      open.textContent = '打开文章页';
      foot.appendChild(open);

      el.dataset.open = '1';
      el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('planet-modal-open');
      modalLastFocus = document.activeElement;
      el.querySelector('.planet-modal-close').focus();
    } catch (err) {
      // 弹窗异常时退回原行为：跳转文章页，保证内容可达
      if (window.console && console.warn) console.warn('[planet] 弹窗打开失败', err);
      if (item && item.url) location.href = item.url;
    }
  }

  function closeModal() {
    if (!modal || modal.dataset.open !== '1') return;
    modal.dataset.open = '0';
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('planet-modal-open');
    if (modalLastFocus && typeof modalLastFocus.focus === 'function') modalLastFocus.focus();
    modalLastFocus = null;
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
        hydrateWaline(container, list);
      } catch (err) {
        container.dataset.rendered = 'error';
        if (window.console && console.warn) console.warn('[planet] 信息流渲染失败', err);
      }
    });
  }

  /* ============ 入口 ============ */

  function init() {
    if (document.querySelector('.planet-feed[data-api]')) {
      initFeed();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
