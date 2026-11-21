const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const { minify: minifyJs } = require('terser');

function readStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function compressHtml(raw) {
  return minifyHtml(raw, {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
    removeRedundantAttributes: false,
    // 内联脚本/样式交给浏览器原样执行，避免二次处理破坏 JSON-LD 或事件绑定
    minifyCSS: false,
    minifyJS: false,
    keepClosingSlash: true,
    ignoreCustomFragments: [/<%[\s\S]*?%>/, /\{\{[\s\S]*?\}\}/]
  });
}

function compressCss(raw) {
  // level 1 只做安全压缩（去空白/注释），不做跨规则合并，避免影响主题层叠
  const result = new CleanCSS({ level: 1, rebase: false }).minify(raw);
  return result.errors.length ? raw : result.styles;
}

async function compressJs(raw) {
  // 不做 compress/mangle，只去注释与空白，保持运行语义完全一致
  const options = { compress: false, mangle: false, format: { comments: false } };
  try {
    const result = await minifyJs(raw, options);
    return result.code || raw;
  } catch (err) {
    // 主题部分脚本是 ES Module（含 import），需显式声明 module 才能解析
    const result = await minifyJs(raw, { ...options, module: true });
    return result.code || raw;
  }
}

/**
 * 产物压缩：HTML / CSS / JS。
 *
 * Hexo 的 after_generate 发生在写盘之前，此时直接改 public/ 无效，
 * 因此这里改写内存中的 route，由 CLI 统一落盘（hexo server 也能立即生效）。
 * 只做语义安全的压缩：不重排 CSS、不改 JS 变量名。
 */
hexo.extend.filter.register('after_generate', async function () {
  const context = this;
  const routes = context.route.list().filter((p) => /\.(html|css|js)$/i.test(p));
  let before = 0;
  let after = 0;
  let changed = 0;

  for (const path of routes) {
    try {
      const buffer = await readStream(context.route.get(path));
      if (!buffer.length) continue;
      const raw = buffer.toString('utf8');
      const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
      const out = ext === '.html'
        ? await compressHtml(raw)
        : ext === '.css'
          ? compressCss(raw)
          : await compressJs(raw);

      if (!out || out.length >= raw.length) continue;
      context.route.set(path, out);
      before += buffer.length;
      after += Buffer.byteLength(out);
      changed += 1;
    } catch (err) {
      hexo.log.warn('[minify] 跳过 %s：%s', path, err.message);
    }
  }

  if (changed) {
    hexo.log.info('[minify] 压缩 %s 个文件：%s KB → %s KB（省 %s KB）',
      changed,
      (before / 1024).toFixed(1),
      (after / 1024).toFixed(1),
      ((before - after) / 1024).toFixed(1));
  }
});
