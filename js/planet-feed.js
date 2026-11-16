/**
 * 星球信息流渲染：读取 planet-data.json（构建期生成，无 API 限流）渲染卡片流。
 * 仅在 /planet/ 页面通过 bodyEnd 注入加载。
 */
(function () {
  'use strict';

  var DATA_URL = window.PLANET_DATA_URL;
  var root = document.getElementById('planet-feed');
  if (!DATA_URL || !root) return;

  var state = { site: null, items: [], cat: '全部', featuredOnly: false, keyword: '' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function relTime(iso) {
    if (!iso) return '';
    var diff = Date.now() - new Date(iso).getTime();
    var m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    var d = Math.floor(h / 24);
    if (d < 30) return d + ' 天前';
    return iso.slice(0, 10);
  }

  function filtered() {
    var kw = state.keyword.trim().toLowerCase();
    return state.items.filter(function (it) {
      if (state.cat !== '全部' && it.categories.indexOf(state.cat) === -1) return false;
      if (state.featuredOnly && !it.featured) return false;
      if (kw) {
        var hay = (it.title + ' ' + it.description + ' ' + it.tags.join(' ')).toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    });
  }

  function card(it, pinned) {
    var tags = it.tags.map(function (t) {
      return '<button class="planet-chip" data-tag="' + esc(t) + '"># ' + esc(t) + '</button>';
    }).join('');
    var cats = it.categories.map(function (c) {
      return '<button class="planet-chip planet-chip-cat" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
    var cover = it.cover
      ? '<a class="planet-cover" href="' + esc(it.link) + '"><img src="' + esc(it.cover) + '" alt="" loading="lazy"></a>'
      : '';
    return '' +
      '<article class="planet-card' + (pinned ? ' planet-card-pinned' : '') + '">' +
        '<div class="planet-card-head">' +
          '<img class="planet-avatar" src="' + esc(state.site.avatar) + '" alt="">' +
          '<div class="planet-who"><span class="planet-author">' + esc(state.site.author) + '</span>' +
          '<span class="planet-time">' + relTime(it.date) + (it.updated && it.updated !== it.date ? ' · 已更新' : '') + '</span></div>' +
          '<div class="planet-badges">' +
            (pinned ? '<span class="planet-badge planet-badge-pin">置顶</span>' : '') +
            (it.featured ? '<span class="planet-badge planet-badge-featured">★ 精华</span>' : '') +
          '</div>' +
        '</div>' +
        '<a class="planet-title" href="' + esc(it.link) + '">' + esc(it.title) + '</a>' +
        '<div class="planet-body">' + esc(it.description) + '</div>' +
        (cover ? '<div class="planet-cover-wrap">' + cover + '</div>' : '') +
        '<div class="planet-meta-row">' + cats + tags + '</div>' +
        '<div class="planet-foot">' +
          '<span class="planet-stat" title="点赞">👍 ' + it.reactions + '</span>' +
          '<span class="planet-stat" title="评论">💬 ' + it.comments + '</span>' +
          '<a class="planet-link" href="' + esc(it.url) + '" target="_blank" rel="noopener">原帖讨论</a>' +
          '<a class="planet-link planet-link-read" href="' + esc(it.link) + '">阅读全文 →</a>' +
        '</div>' +
      '</article>';
  }

  function render() {
    var list = filtered();
    var pinned = list.filter(function (it) { return it.pinned; });
    var rest = list.filter(function (it) { return !it.pinned; });

    var cats = ['全部'];
    state.items.forEach(function (it) {
      it.categories.forEach(function (c) { if (cats.indexOf(c) === -1) cats.push(c); });
    });

    var html = '<div class="planet-toolbar">' +
      '<div class="planet-cats">' + cats.map(function (c) {
        return '<button class="planet-tab' + (state.cat === c ? ' planet-tab-on' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('') + '</div>' +
      '<div class="planet-tools">' +
        '<button class="planet-tab planet-feat' + (state.featuredOnly ? ' planet-tab-on' : '') + '" id="planet-feat-btn">★ 精华</button>' +
        '<input class="planet-search" id="planet-search" type="search" placeholder="搜索标题 / 标签" value="' + esc(state.keyword) + '">' +
      '</div></div>' +
      '<div class="planet-count">共 ' + list.length + ' 条' + (pinned.length ? '，置顶 ' + pinned.length + ' 条' : '') + '</div>' +
      (pinned.length ? '<div class="planet-pin-zone">' + pinned.map(function (it) { return card(it, true); }).join('') + '</div>' : '') +
      '<div class="planet-list">' + (rest.map(function (it) { return card(it, false); }).join('') || '') + '</div>' +
      (list.length ? '' : '<div class="planet-empty">没有匹配的动态</div>');

    root.innerHTML = html;

    root.querySelectorAll('.planet-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = b.getAttribute('data-cat');
        if (c) state.cat = c;
        if (b.id === 'planet-feat-btn') state.featuredOnly = !state.featuredOnly;
        render();
      });
    });
    root.querySelectorAll('.planet-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = b.getAttribute('data-cat');
        var t = b.getAttribute('data-tag');
        if (c) state.cat = c;
        if (t) { state.keyword = t; }
        render();
      });
    });
    var si = root.querySelector('#planet-search');
    if (si) si.addEventListener('input', function () { state.keyword = si.value; renderListOnly(); });
  }

  // 输入时只重绘列表，避免搜索框失焦
  function renderListOnly() {
    var list = filtered();
    var pinned = list.filter(function (it) { return it.pinned; });
    var rest = list.filter(function (it) { return !it.pinned; });
    var pz = root.querySelector('.planet-pin-zone');
    var ls = root.querySelector('.planet-list');
    var ct = root.querySelector('.planet-count');
    if (ct) ct.textContent = '共 ' + list.length + ' 条' + (pinned.length ? '，置顶 ' + pinned.length + ' 条' : '');
    if (pz) pz.innerHTML = pinned.map(function (it) { return card(it, true); }).join('');
    if (ls) ls.innerHTML = rest.map(function (it) { return card(it, false); }).join('') ||
      (list.length ? '' : '<div class="planet-empty">没有匹配的动态</div>');
    if (!list.length && !ls.querySelector('.planet-empty')) {
      root.insertAdjacentHTML('beforeend', '<div class="planet-empty">没有匹配的动态</div>');
    }
  }

  fetch(DATA_URL, { headers: { 'Cache-Control': 'no-cache' } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      state.site = data.site;
      state.items = data.items || [];
      render();
    })
    .catch(function (e) {
      root.innerHTML = '<div class="planet-empty">星球数据加载失败：' + esc(e.message) + '</div>';
    });
})();
