/**
 * 星球帖判定与隔离（方案B）：星球帖保留独立文章页，但不参与博客侧的
 * 列表 / 归档 / 标签 / 分类 / RSS / sitemap / 本地搜索 / 侧栏「最近更新」。
 *
 * 判定依据：tools/sync-planet.mjs 生成的帖子文件名为 planet-<Issue编号>.md。
 * v2 主题对 front matter 做严格 schema 校验，因此星球帖不再带自定义 planet 字段。
 *
 * 机制（源码核实）：
 * - hexo.locals 的 posts/tags/categories 是「getter + 缓存」（node_modules/hexo/dist/hexo/locals.js），
 *   hexo._runGenerators() 会先 invalidate 缓存再 toObject() 得到 siteLocals，
 *   而模板里的 site.posts / site.tags / site.categories 正是这份 localsObj。
 *   => 在 before_generate 里替换 getters，就能一次性把星球帖从所有博客侧消费点排除，
 *      不必逐个复制 hexo-generator-index/archive/tag/category/feed/sitemap 的源码。
 * - 星球帖页面自己的生成：覆盖内置 post 生成器，改用原始 Post 模型取全量文章。
 * - Stellar v2 的 collection pipeline 也在 before_generate 里读取 locals.posts 并为每篇
 *   文章构建 ViewModel（星球帖文章页渲染依赖它）。因此本过滤必须排在 pipeline 之后
 *   （priority 2 > pipeline 的 1）；hexo 在 _runGenerators 前会 invalidate 缓存，
 *   此时 toObject() 才会取到过滤后的 posts。
 *
 * 升级注意：依赖 hexo.locals.getters / set / invalidate 内部结构，Hexo 大版本升级需回归验证。
 */
'use strict';

// 判定规则只在 scripts/planet-source.js 维护一份，避免各脚本漂移
const { PLANET_SOURCE } = require('./planet-source');

/** 星球帖判定：文件名 planet-<n>.md */
function isPlanetPost(p) {
  return !!p && typeof p.source === 'string' && PLANET_SOURCE.test(p.source);
}

let isolated = false;

hexo.extend.filter.register('before_generate', () => {
  if (isolated) return;
  isolated = true;

  const getters = hexo.locals.getters || {};
  const rawPosts = getters.posts;
  if (typeof rawPosts !== 'function') {
    hexo.log.warn('[planet-isolation] 读取 hexo.locals.posts 失败，星球帖隔离未生效');
    return;
  }

  const rawTags = getters.tags;
  const rawCategories = getters.categories;

  const all = rawPosts();
  const planetCount = all.filter(isPlanetPost).length;
  hexo.log.info('[planet-isolation] 博客侧文章 %d 篇（排除星球帖 %d 篇）',
    all.length - planetCount, planetCount);

  hexo.locals.set('posts', () => rawPosts().filter(p => !isPlanetPost(p)));
  // 标签/分类项可能同时属于两类文章，保留项本身，只剔除「只剩星球帖」的项：
  // tag.posts / category.posts 是虚拟属性，走上面的 posts getter，因此已只剩博客文章。
  if (typeof rawTags === 'function') {
    hexo.locals.set('tags', () => rawTags().filter(tag => tag.posts.length > 0));
  }
  if (typeof rawCategories === 'function') {
    hexo.locals.set('categories', () => rawCategories().filter(cat => cat.posts.length > 0));
  }
}, 2);

/**
 * 覆盖内置 post 生成器（node_modules/hexo/dist/plugins/generator/post.js 逻辑）：
 * 星球帖文章页必须仍然生成，而 locals.posts 已被过滤，故直接查原始 Post 模型。
 * prev/next 只在同类内容里串联，避免博客文章页出现「下一篇：星球帖」。
 */
function postGenerator() {
  const query = {};
  if (!this.config.future) query.date = { $lte: Date.now() };
  if (!this._showDrafts()) query.published = true;

  const allPosts = this.model('Post').find(query).sort('-date').toArray();
  const blogPosts = allPosts.filter(p => !isPlanetPost(p));
  const planetPosts = allPosts.filter(isPlanetPost);
  const indexOf = new Map();
  blogPosts.forEach((p, i) => indexOf.set(p._id, i));
  planetPosts.forEach((p, i) => indexOf.set(p._id, i));

  return allPosts.map(post => {
    const { path, layout } = post;
    if (!layout || layout === 'false') {
      return { path, data: post.content };
    }

    const siblings = isPlanetPost(post) ? planetPosts : blogPosts;
    const i = indexOf.get(post._id);
    if (i > 0) post.prev = siblings[i - 1];
    if (i < siblings.length - 1) post.next = siblings[i + 1];

    const layouts = ['post', 'page', 'index'];
    if (layout !== 'post') layouts.unshift(layout);
    post.__post = true;
    return { path, layout: layouts, data: post };
  });
}

hexo.extend.generator.register('post', postGenerator);

module.exports = { isPlanetPost, PLANET_SOURCE };
