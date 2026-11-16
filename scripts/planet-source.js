/**
 * 星球帖来源判定的共享常量与工具（纯函数，无副作用的辅助模块）。
 *
 * 唯一判定依据：帖子源文件名 `planet-<Issue编号>.md`，由 tools/sync-planet.mjs 生成。
 * 不依赖 front matter 自定义字段（Stellar v2 对 front matter 做严格 schema 校验）。
 *
 * 使用方：
 * - scripts/planet-isolation.js：博客侧隔离
 * - scripts/planet-marker.js：HTML 渲染期来源标记
 * - scripts/planet-generator.js：信息流数据里的 source 字段
 */
'use strict';

/** 匹配源文件路径，捕获组 1 = Issue 编号 */
const PLANET_SOURCE = /_posts[\\/]planet-(\d+)\.md$/;

/** 内容来源仓库（与 tools/sync-planet.mjs 的默认值保持一致） */
const GITHUB_REPO = 'mazhenren/impulsewave';

/** 从帖子 source 解析 Issue 编号；非星球帖返回 null */
function parseIssueNumber(source) {
  if (typeof source !== 'string') return null;
  const m = source.match(PLANET_SOURCE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** Issue 原文链接（可追溯） */
function issueUrl(number) {
  return 'https://github.com/' + GITHUB_REPO + '/issues/' + number;
}

/** 来源描述对象，写入信息流数据与 HTML 标记 */
function sourceInfo(number) {
  return {
    type: 'github-issue',
    number: number,
    url: issueUrl(number)
  };
}

module.exports = { PLANET_SOURCE, GITHUB_REPO, parseIssueNumber, issueUrl, sourceInfo };
