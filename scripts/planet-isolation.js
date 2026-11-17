/**
 * 星球帖判定与隔离：星球帖保留独立文章页，且**只从专栏列表（/posts/）排除**。
 * 归档、分类、标签、站内搜索、RSS 等其它出口都会包含星球帖。
 *
 * 判定依据：tools/sync-planet.mjs 生成的帖子文件名为 planet-<Issue编号>.md。
 * v2 主题对 front matter 做严格 schema 校验，因此星球帖不再带自定义 planet 字段。
 *
 * 机制：
 * - 不再改写 hexo.locals.posts：全局过滤会连带影响归档/标签/分类/搜索/RSS。
 * - 覆盖 hexo-generator-index（/posts/ 列表）的生成器，在分页前剔除星球帖；
 *   其余生成器（archive/tag/category/feed/searchdb/sitemap）读取全量 posts。
 * - 星球帖文章页由下面的 post 生成器覆盖负责生成，prev/next 只在同类内容里串联。
 *
 * 升级注意：依赖 hexo.locals.getters / set / invalidate 内部结构，Hexo 大版本升级需回归验证。
 */
'use strict';

const pagination = require('hexo-pagination');

// 判定规则只在 scripts/planet-source.js 维护一份，避免各脚本漂移
const { PLANET_SOURCE } = require('./planet-source');

/** 星球帖判定：文件名 planet-<n>.md */
function isPlanetPost(p) {
  return !!p && typeof p.source === 'string' && PLANET_SOURCE.test(p.source);
}

/**
 * 覆盖 hexo-generator-index（node_modules/hexo-generator-index/lib/generator.js）：
 * 与内置逻辑一致，只在排序后剔除星球帖，保证 /posts/ 只出现专栏文章。
 */
function indexGenerator(locals) {
  const config = this.config;
  const ig = config.index_generator || {};
  const posts = locals.posts
    .sort(ig.order_by || '-date')
    .filter(p => !isPlanetPost(p));

  posts.data.sort((a, b) => (b.sticky || 0) - (a.sticky || 0));

  const paginationDir = ig.pagination_dir || config.pagination_dir || 'page';
  const path = ig.path || '';

  return pagination(path, posts, {
    perPage: ig.per_page || config.per_page,
    layout: ig.layout || ['index', 'archive'],
    format: paginationDir + '/%d/',
    data: {
      __index: true
    }
  });
}

hexo.extend.generator.register('index', indexGenerator);

/**
 * 覆盖内置 post 生成器（node_modules/hexo/dist/plugins/generator/post.js 逻辑）：
 * 星球帖文章页必须仍然生成，prev/next 只在同类内容里串联，
 * 避免博客文章页出现「下一篇：星球帖」。
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
