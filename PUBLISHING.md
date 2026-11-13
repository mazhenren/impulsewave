# PUBLISHING

本文件是本博客的发布约定手册。AI 助手在此仓库内工作时先读本文件。

## 站点事实

| 项目 | 值 |
|------|------|
| GitHub 账号 | mazhenren |
| 仓库 | https://github.com/mazhenren/impulsewave |
| 站点主题 | 股票期货外汇技术分析笔记（分类：股票/期货/外汇/技术分析/交易笔记） |
| 线上地址 | https://mazhenren.github.io/impulsewave/ |
| 博客框架 | Hexo 7.3.0 + NexT 主题 v8.29.0（scheme: Pisces；git clone 固定 release 安装于 themes/next，内部 .git 已删除） |
| 搜索插件 | hexo-generator-searchdb（limit 10000）；已启用阅读四件套/头像/GitHub 角标/Utterances 评论（评论需 Utterances App 已装才生效） |
| 访问统计 | 侧栏图片式计数器（visitor-badge.laobi.icu，`source/_data/sidebar.njk`）；不蒜子已关闭（官方接口浏览器端常被阻断） |
| 主题配置 | _config.next.yml（alternate theme config）+ source/_data/styles.styl（自定义样式注入） |
| 默认分支 | master（源码）/ gh-pages（成品，禁手改） |
| 站点子路径 | /impulsewave/ |
| 永久链接 | `posts/:abbrlink/`（hexo-abbrlink，crc32/hex，8 位短码） |
| SEO 插件 | hexo-generator-sitemap（sitemap.xml）、hexo-filter-nofollow（field: post）、source/_data/head.ejs（OG/Twitter/JSON-LD） |
| 根目录仓库 | https://github.com/mazhenren/mazhenren.github.io（robots.txt、跳转页、验证文件、IndexNow key，Pages 源 main/） |
| 部署链路 | push master → GitHub Actions（.github/workflows/deploy.yml，npm ci + hexo generate）→ gh-pages 分支 → Pages 发布 → IndexNow/百度主动推送 |

## 本站发布规则

- 文章入 `source/_posts/`，文件名 `YYYY-MM-DD-标题slug.md`
- 图片入 `source/images/`，正文引用 `/images/xxx`（渲染器 prependRoot 自动补 /impulsewave 前缀）
- front matter 由 AI 自动生成（title/date/description/keywords；author 由站点配置统一提供，不在文章里重复声明）
- description 由 AI 通读全文提炼要点（≤100 字）；keywords 3-5 个，逗号分隔
- 每篇 3-5 条内链：至少 1 条到分类页、2 条到相关文章
- 图片必须有 alt

## SEO 发布检查清单

- [ ] front matter 含 `description`（≤100 字）与 `keywords`（3-5 个）
- [ ] 文中至少 3 条内链，其中 1 条指向分类页
- [ ] 图片有 alt，正文首图可作为 og:image（front matter `cover`）
- [ ] 本地 `npx hexo clean && npx hexo generate` 后，`public/sitemap.xml` 含新文章短链
- [ ] 新文章 head 中 canonical 与 og:url 一致、og:image 为绝对地址
- [ ] 旧文有实质修改时，确认 `article:modified_time` 已更新

## 验证闭环

1. push 后确认仓库 Actions 页 Deploy 工作流 success（20~60 秒）
2. 确认 Pages 构建 built 无报错（gh api 或仓库 Pages 页）
3. 带 `?cachebust=<时间戳>` 抓取线上确认内容生效（CDN 缓存）

## 已知坑

- 纯日期的 front matter date 会被 Hexo 按 UTC 解析 → URL 日期偏移一天：date 必须带时间
- git clone 安装的主题目录必须删除内部 .git，否则 Actions 构建缺主题
- 主题未识别的配置键会静默忽略：改配置后必须 grep 构建产物确认生效
- `config.url` 已含 `/impulsewave` 子路径，拼绝对地址只能用 `config.url + '/' + 相对路径`，再加 `config.root` 会出现 `/impulsewave/impulsewave/`
- `404.html` 必须带 `sitemap: false`，否则会被写进 sitemap
- `robots.txt` 只在域名根生效：本仓库的 `source/robots.txt` 仅供本地对照，线上以 `mazhenren.github.io` 根仓库为准
- 站点未完成百度域名验证前，百度主动推送会返回错误（工作流按 best-effort 处理，不阻断构建）
