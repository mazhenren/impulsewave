#!/usr/bin/env node
/**
 * 星球内容同步：GitHub Issues → source/_posts/planet-<n>.md + source/_data/planet-meta.json
 *
 * 收录规则（默认收录，无需打标签）：
 *   - 仓库所有者的 Issue 自动视为星球帖（发帖即同步）
 *   - 其他人的 Issue 仅在带 planet 标签时同步
 *   - 排除：Bot 创建的 Issue（utterances 评论机器人会建 Issue）、status/draft、PR
 *   - closed 视为下线（删除对应文件）；想单独排除一条就加 status/draft 标签
 * 幂等：文件名固定 planet-<number>.md；正文+标签+标题未变化（checksum 相同）时不重写。
 *
 * 与 Stellar v2 的配合：
 *   - v2 对 front matter 做严格 schema 校验，未知字段会产生构建警告。因此这里不再写
 *     自定义 `planet:` 块，Issue 编号由文件名 planet-<n>.md 表达，其它元数据（评论/点赞/
 *     置顶/精华/checksum）统一放在 _data/planet-meta.json。
 *   - 星球帖不进搜索：`visibility.searchable: false`（v2 字段，替代 v1 的 indexing）。
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const postsDir = path.join(root, 'source', '_posts');
const dataDir = path.join(root, 'source', '_data');
const imagesDir = path.join(root, 'source', 'images', 'planet');
const metaPath = path.join(dataDir, 'planet-meta.json');

const repo = process.env.GITHUB_REPOSITORY || 'mazhenren/impulsewave';
const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('缺少 GITHUB_TOKEN');
  process.exit(1);
}

const API = 'https://api.github.com';
async function gh(pathname) {
  const res = await fetch(API + pathname, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'planet-sync'
    }
  });
  if (!res.ok) throw new Error(`${res.status} ${pathname}: ${await res.text()}`);
  return res.json();
}

/** UTC ISO → 东八区 "YYYY-MM-DD HH:mm:ss"（Hexo date 必须带时间，否则 URL 日期偏移） */
function toLocalDate(iso) {
  const d = new Date(iso);
  d.setUTCHours(d.getUTCHours() + 8);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/** 解析 Issue Form 生成的 "### 字段" 分节 */
function parseBody(body) {
  const sections = {};
  const ms = [...body.matchAll(/^###\s+(.+?)\s*$/gm)];
  let content = '';
  if (ms.length) {
    for (let i = 0; i < ms.length; i++) {
      const start = ms[i].index + ms[i][0].length;
      const end = i + 1 < ms.length ? ms[i + 1].index : body.length;
      sections[ms[i][1].trim()] = body.slice(start, end).trim();
    }
    const lead = body.slice(0, ms[0].index).replace(/<!--[\s\S]*?-->/g, '').trim();
    content = sections['正文'] || lead || '';
  } else {
    content = body.replace(/<!--[\s\S]*?-->/g, '').trim();
  }
  return { content, sections };
}

function pick(s) {
  return String(s || '').replace(/^["']|["']$/g, '').trim();
}

/* ============ 图片本地化 ============
 * GitHub Issue 里的图片是 https://github.com/user-attachments/assets/<id> 外链：
 *   - 需要能连上 github.com / S3 才能显示（国内网络常常打不开，表现为错误占位图）
 *   - 实际资源是 302 跳转到带签名的 S3 地址，签名有效期只有几分钟，不适合长期直链
 * 因此同步时把图片下载到 source/images/planet/<Issue编号>/，正文改写为站内路径。
 * 下载失败时保留原外链并告警，不阻断同步。
 */
const GITHUB_IMG = /https:\/\/github\.com\/user-attachments\/assets\/[A-Za-z0-9-]+/g;
const IMG_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };

let proxyReady = false;
/** 本地走代理时让 fetch 也走代理；CI 无代理则直连 */
async function prepareProxy() {
  if (proxyReady) return;
  proxyReady = true;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY;
  if (!proxy) return;
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(proxy));
    console.log(`图片下载走代理: ${proxy}`);
  } catch {
    console.log('未能启用代理（undici 不可用），图片下载将直连');
  }
}

async function downloadImage(url, num) {
  const dir = path.join(imagesDir, String(num));
  fs.mkdirSync(dir, { recursive: true });
  const id = (url.match(/assets\/([A-Za-z0-9-]+)/) || [])[1];
  if (!id) return url;

  // 已下载过就复用（扩展名由首次下载时的 Content-Type 决定）
  for (const ext of Object.values(IMG_EXT)) {
    const hit = path.join(dir, id + ext);
    if (fs.existsSync(hit)) return `/images/planet/${num}/${id}${ext}`;
  }

  try {
    await prepareProxy();
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    const ext = IMG_EXT[type] || '.png';
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('空文件');
    fs.writeFileSync(path.join(dir, id + ext), buf);
    return `/images/planet/${num}/${id}${ext}`;
  } catch (err) {
    console.warn(`图片下载失败，保留外链 #${num}: ${url} (${err.message})`);
    return url;
  }
}

/** 把正文里的 GitHub 图片外链替换为站内路径（同一 URL 只下载一次） */
async function localizeImages(content, num) {
  const urls = [...new Set(content.match(GITHUB_IMG) || [])];
  if (!urls.length) return content;
  const map = new Map();
  for (const u of urls) map.set(u, await downloadImage(u, num));
  return content.replace(GITHUB_IMG, u => map.get(u) || u);
}

/** YAML 双引号字符串转义：内部双引号换成全角，避免破坏 front matter */
function escYaml(s) {
  return String(s).replace(/"/g, '”');
}

const owner = (process.env.GITHUB_REPOSITORY_OWNER || repo.split('/')[0]).toLowerCase();

// 拉全部 Issue（含 PR，后面过滤），本地按「所有者默认收录」规则筛选
const issues = [];
let page = 1;
for (;;) {
  const batch = await gh(`/repos/${repo}/issues?state=all&sort=created&direction=desc&per_page=100&page=${page}`);
  issues.push(...batch);
  if (batch.length < 100) break;
  page++;
}

function isBot(issue) {
  const u = issue.user || {};
  const login = (u.login || '').toLowerCase();
  return u.type === 'Bot' || /\[bot\]$/.test(login) || login.includes('utterances');
}

const plain = issues.filter(i => {
  if (i.pull_request) return false;
  if (isBot(i)) return false; // 评论机器人自动建的 Issue 不是星球帖
  const labels = i.labels.map(l => l.name);
  if (labels.includes('planet')) return true;
  // 仓库所有者发的 Issue 默认就是星球帖，无需打标签
  return (i.user && i.user.login || '').toLowerCase() === owner;
});

// 上一次同步的元数据：checksum 用于变更检测
let prevMeta = { issues: [] };
if (fs.existsSync(metaPath)) {
  try {
    prevMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    prevMeta = { issues: [] };
  }
}
const prevChecksums = new Map((prevMeta.issues || []).map(i => [i.number, i.checksum]));

const meta = { generated_at: new Date().toISOString(), issues: [] };
let added = 0, updated = 0, removed = 0, skipped = 0;
const keep = new Set();

for (const issue of plain) {
  if (issue.state === 'closed') continue; // 下线：文件会被清理
  const num = issue.number;
  const labels = issue.labels.map(l => l.name);
  if (labels.includes('status/draft')) continue;

  const fname = `planet-${num}.md`;
  keep.add(fname);
  const filePath = path.join(postsDir, fname);

  const { content, sections } = parseBody(issue.body || '');
  const pinned = labels.includes('pin') || /- \[x\]/i.test(sections['置顶'] || '');
  const featured = labels.includes('featured');
  const category = pick(sections['分类']) ||
    // 未走发帖表单的 Issue 没有「分类」字段，回退到 cat/ 前缀标签
    labels.filter(l => l.startsWith('cat/')).map(l => l.slice(4))[0] || '';
  const tags = pick(sections['标签']).split(/[,，]/).map(s => s.trim()).filter(Boolean);
  let description = pick(sections['摘要']);
  if (!description) {
    description = content
      // 先剔除图片语法，否则 URL 会被当作正文摘要（表单外的 Issue 常见写法）
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*`\[\]()\-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  }
  const cover = pick(sections['封面图']);

  // 变更检测：标题+正文+标签+级别 任意变化才重写文件
  const checksum = crypto
    .createHash('sha1')
    // 'fm-v9'：front matter 结构版本，改动生成格式时递增以强制重写存量文件
    // v9：图片改为下载到 source/images/planet/<n>/ 并改写为站内路径
    .update([issue.title, issue.body || '', labels.join(','), pinned, featured, 'fm-v9'].join('\u0000'))
    .digest('hex')
    .slice(0, 12);

  // hexo-abbrlink 构建时会写回 abbrlink，重写文件必须保留，否则永久链接变化导致旧链接失效
  let prevAbbrlink = null;
  if (fs.existsSync(filePath)) {
    const a = fs.readFileSync(filePath, 'utf8').match(/^abbrlink:\s*(\S+)/m);
    prevAbbrlink = a ? a[1] : null;
  }

  if (prevChecksums.get(num) === checksum) {
    skipped++;
  } else {
    // 图片外链 → 站内路径（下载失败时保持原外链，不阻断同步）
    const body = await localizeImages(content, num);
    const fm = [
      '---',
      `title: "${escYaml(issue.title)}"`,
      `date: ${toLocalDate(issue.created_at)}`,
      `description: "${escYaml(description)}"`
    ];
    if (prevAbbrlink) fm.push(`abbrlink: ${prevAbbrlink}`);
    if (category) fm.push('categories:', `  - ${category}`);
    if (tags.length) {
      fm.push('tags:');
      for (const t of tags) fm.push(`  - ${t}`);
    }
    if (cover) fm.push(`cover: ${cover}`);
    fm.push(
      // 关掉主题默认评论区（issue-term: pathname 会另开新 Issue）。
      // v2 的 front matter schema 要求 comments 是 object，写成布尔值会告警并回落默认配置
      'comments:',
      '  enabled: false',
      // 星球帖只从专栏列表（/posts/）排除；归档/标签/搜索索引/RSS 正常收录。
      // sitemap 与主题 visibility 标记保持关闭（星球内容不进搜索引擎站点地图与主题可见性标记）
      'sitemap: false',
      'visibility:',
      '  searchable: false',
      '---'
    );
    fs.writeFileSync(filePath, fm.join('\n') + '\n\n' + body.trim() + '\n', 'utf8');
    if (!prevChecksums.has(num)) added++; else updated++;
    console.log(`同步: #${num} ${issue.title} (${prevChecksums.has(num) ? '更新' : '新增'})`);
  }

  meta.issues.push({
    number: num,
    comments: issue.comments || 0,
    reactions: (issue.reactions && issue.reactions.total_count) || 0,
    updated: issue.updated_at,
    state: issue.state,
    pinned,
    featured,
    checksum
  });
}

// 清理已下线（关闭/删除/转草稿）的帖子文件，并一并删除其图片目录
for (const f of fs.readdirSync(postsDir)) {
  if (/^planet-\d+(\b|-)/.test(f) && f.endsWith('.md') && !keep.has(f)) {
    const num = parseInt(f.match(/^planet-(\d+)/)[1], 10);
    fs.unlinkSync(path.join(postsDir, f));
    fs.rmSync(path.join(imagesDir, String(num)), { recursive: true, force: true });
    removed++;
    console.log(`下线: ${f}`);
  }
}

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');

console.log(`完成：新增 ${added}，更新 ${updated}，跳过 ${skipped}，下线 ${removed}，在线 ${meta.issues.length}`);
