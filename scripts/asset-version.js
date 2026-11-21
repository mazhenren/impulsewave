const VERSION = (process.env.GITHUB_SHA || '').slice(0, 8) || Date.now().toString(36);

/**
 * 静态资源版本号自动化。
 * 把模板里手写的 `?v=xxx` 统一替换为当前构建版本（CI 用 commit SHA，本地用时间戳）。
 */
hexo.extend.filter.register('after_render:html', function (str) {
  if (!str || str.indexOf('?v=') === -1) return str;
  return str.replace(/(\/(?:impulsewave\/)?(?:js|css)\/[^"'?\s]+)\?v=[^"'&\s]+/g, `$1?v=${VERSION}`);
});
