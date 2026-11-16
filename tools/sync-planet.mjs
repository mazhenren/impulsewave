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
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const postsDir = path.join(root, 'source', '_posts');
const dataDir = path.join(root, 'source', '_data');

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

function slugify(t) {
  return String(t)
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=\[\]\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'post';
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
    .update([issue.title, issue.body || '', labels.join(','), pinned, featured, 'fm-v4'].join('\u0000'))
    .digest('hex')
    .slice(0, 12);

  let prevChecksum = null;
  let prevAbbrlink = null;
  if (fs.existsSync(filePath)) {
    const prev = fs.readFileSync(filePath, 'utf8');
    const m = prev.match(/checksum:\s*(\S+)/);
    prevChecksum = m ? m[1] : null;
    // hexo-abbrlink 构建时会写回 abbrlink，重写文件必须保留，否则永久链接变化导致旧链接失效
    const a = prev.match(/^abbrlink:\s*(\S+)/m);
    prevAbbrlink = a ? a[1] : null;
  }

  if (prevChecksum === checksum) {
    skipped++;
  } else {
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
      // 关掉主题默认评论区（issue-term: pathname 会另开新 Issue），
      // 由 planet-enhance.js 按 planet.issue 注入 issue-number 版 utterances，讨论统一收敛到原 Issue
      'comments: false',
      'planet:',
      `  issue: ${num}`,
      `  pinned: ${pinned}`,
      `  featured: ${featured}`,
      `  updated: ${issue.updated_at}`,
      `  url: https://github.com/${repo}/issues/${num}`,
      `  checksum: ${checksum}`,
      '---'
    );
    fs.writeFileSync(filePath, fm.join('\n') + '\n\n' + content.trim() + '\n', 'utf8');
    if (prevChecksum === null) added++; else updated++;
    console.log(`同步: #${num} ${issue.title} (${prevChecksum === null ? '新增' : '更新'})`);
  }

  meta.issues.push({
    number: num,
    comments: issue.comments || 0,
    reactions: (issue.reactions && issue.reactions.total_count) || 0,
    updated: issue.updated_at,
    state: issue.state
  });
}

// 清理已下线（关闭/删除/转草稿）的帖子文件
for (const f of fs.readdirSync(postsDir)) {
  if (/^planet-\d+(\b|-)/.test(f) && f.endsWith('.md') && !keep.has(f)) {
    fs.unlinkSync(path.join(postsDir, f));
    removed++;
    console.log(`下线: ${f}`);
  }
}

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'planet-meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

console.log(`完成：新增 ${added}，更新 ${updated}，跳过 ${skipped}，下线 ${removed}，在线 ${meta.issues.length}`);
