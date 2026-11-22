'use strict';

/**
 * 图片变体规则（构建期共享定义）。
 *
 * 被 optimize-images.js（生成 WebP 变体）与 responsive-images.js（输出 srcset）共用，
 * 保证两边对「档位、命名、CDN 地址」的理解完全一致。
 *
 * 该文件是纯模块，Hexo 把它当 script 载入时不会注册任何过滤器，无副作用。
 */

const path = require('path');

// 内容图片的宽度档位；实际会按原图宽度裁剪，不会放大
const CONTENT_WIDTHS = [480, 960, 1600];

const MAX_WIDTH = 1600;
const AVATAR_MAX = 400;
const WEBP_QUALITY = 78;

// jsDelivr 的 Gcore 节点；@gh-pages 是 public/ 的产物分支（含压缩后的图片与 WebP 变体）
const CDN_BASE = 'https://gcore.jsdelivr.net/gh/mazhenren/impulsewave@gh-pages';

// 一键关闭 CDN：false 时 srcset 回落到站内相对地址，行为等同于纯本地优化
const ENABLE_CDN = true;

/** 是否为头像（走 400px 上限，且不生成内容变体） */
function isAvatar(routePath) {
  return /(^|\/)avatar\.[^/]+$/i.test(String(routePath));
}

/** images/planet/6/x.png + 480 → images/planet/6/x.480w.webp */
function variantRoute(routePath, width) {
  const ext = path.posix.extname(routePath);
  return routePath.slice(0, -ext.length) + '.' + width + 'w.webp';
}

/**
 * 按原图宽度裁剪档位：
 * - 只保留小于原宽度的档位（避免放大）
 * - 始终保留 min(上限, 原宽度) 作为最大档
 */
function widthsFor(width, routePath) {
  const cap = isAvatar(routePath) ? AVATAR_MAX : MAX_WIDTH;
  const effective = Math.max(1, Math.min(width, cap));
  const list = CONTENT_WIDTHS.filter((w) => w < effective);
  list.push(effective);
  return [...new Set(list)].sort((a, b) => a - b);
}

/** route 路径 → 可对外访问的绝对地址（CDN 或原站） */
function publicUrl(routePath, root = '/') {
  const clean = String(routePath).replace(/^\/+/, '');
  if (ENABLE_CDN) return CDN_BASE + '/' + clean;
  return String(root).replace(/\/?$/, '/') + clean;
}

module.exports = {
  CONTENT_WIDTHS,
  MAX_WIDTH,
  AVATAR_MAX,
  WEBP_QUALITY,
  CDN_BASE,
  ENABLE_CDN,
  isAvatar,
  variantRoute,
  widthsFor,
  publicUrl
};
