const path = require('path');
const sharp = require('sharp');

const MAX_WIDTH = 1600;
const AVATAR_MAX = 400;
const JPEG_QUALITY = 80;
const PNG_QUALITY = 82;

function readStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function optimize(input, maxWidth) {
  const image = sharp(input, { failOn: 'none' });
  const meta = await image.metadata();
  let pipeline = image;
  if (meta.width && meta.width > maxWidth) {
    pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  }
  pipeline = meta.format === 'jpeg'
    ? pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    : pipeline.png({ compressionLevel: 9, palette: true, quality: PNG_QUALITY });

  return pipeline.toBuffer();
}

/**
 * 图片压缩：在内存 route 上替换图片内容（after_generate 时尚未写盘）。
 * 只压缩 public 产物，不修改 source 原图，因此重复构建不会产生二次有损压缩。
 */
hexo.extend.filter.register('after_generate', async function () {
  const context = this;
  const routes = context.route.list().filter((p) => /^images\/.*\.(jpe?g|png)$/i.test(p));
  let before = 0;
  let after = 0;
  let changed = 0;

  for (const routePath of routes) {
    try {
      const input = await readStream(context.route.get(routePath));
      before += input.length;
      const rel = routePath.replace(/^images\//, '');
      const limit = /^avatar\./i.test(rel) || path.basename(rel).startsWith('avatar.') ? AVATAR_MAX : MAX_WIDTH;
      const output = await optimize(input, limit);
      if (output && output.length < input.length) {
        context.route.set(routePath, output);
        after += output.length;
        changed += 1;
      } else {
        after += input.length;
      }
    } catch (err) {
      hexo.log.warn('[images] 跳过 %s：%s', routePath, err.message);
    }
  }

  if (changed) {
    hexo.log.info('[images] 压缩 %s 张：%s MB → %s MB',
      changed,
      (before / 1024 / 1024).toFixed(2),
      (after / 1024 / 1024).toFixed(2));
  }
});
