# PUBLISHING

本文件是本博客的发布约定手册。AI 助手在此仓库内工作时先读本文件。

## 站点事实

| 项目 | 值 |
|------|------|
| GitHub 账号 | mazhenren |
| 仓库 | https://github.com/mazhenren/impulsewave |
| 站点主题 | 股票期货外汇技术分析笔记（分类：股票/期货/外汇/技术分析/交易笔记） |
| 站点署名 | 薛定谔（`_config.yml` 的 `author`，文章 front matter 不再写 author） |
| 线上地址 | https://mazhenren.github.io/impulsewave/ |
| 博客框架 | Hexo 8.1.2 + Stellar 主题 2.0.0（npm 安装；要求 Node 22+，本地用 `C:\Users\xuhui\.workbuddy\binaries\node\versions\22.12.0`） |
| 主题配置 | `_config.stellar.yml` 采用 v2 结构（`leftbar`/`profiles`/`article`/`search`/`comments`/`inject`）；左栏组件在 `source/_data/widgets.yml` |
| 主题特性 | 原生 timeline（首页星球动态）、文章 license、字数/阅读时长、置顶（`listing.priority`）、本地搜索（/search.json）、JSON-LD/canonical、ESM Runtime 按需加载 |
| 搜索 | Stellar 内置 `search.provider: local`（/search.json） |
| 访问统计 | 侧栏图片式计数器（visitor-badge.laobi.icu，`source/_data/widgets.yml` 的 visitor 组件）+ 文章页 `#license` 区块（`source/js/planet-badge.js`）；不蒜子已关闭（官方接口浏览器端常被阻断） |
| 首页 | `/` 为星球动态页（`scripts/home-generator.js` 输出 timeline 等价 HTML），文章列表在 `/posts/`（`index_generator.path: posts`） |
| 信息流数据 | 构建期生成的 `/planet-issues.json`（GitHub Issues 兼容格式，含 `number`、评论/点赞计数、置顶/精华） |
| 信息流增强 | `source/js/planet-enhance.js` + `source/css/planet.css`（标签筛选栏、长动态折叠、卡片内 utterances 评论懒加载） |
| 评论映射 | utterances 用 `issue-number` 直连原 Issue；星球帖 front matter 写 `comments.enabled: false`，其评论区由脚本注入对应 Issue，避免 pathname 另开新 Issue |
| 默认分支 | master（源码）/ gh-pages（成品，禁手改） |
| 站点子路径 | /impulsewave/ |
| 永久链接 | `posts/:abbrlink/`（hexo-abbrlink，crc32/hex，8 位短码） |
| SEO 插件 | hexo-generator-sitemap（sitemap.xml）、hexo-filter-nofollow（field: post）；OG/Twitter/JSON-LD 由 Stellar 原生输出（无需 source/_data/head.ejs，该文件为 NexT 时代遗留，已移出） |
| 根目录仓库 | https://github.com/mazhenren/mazhenren.github.io（robots.txt、跳转页、验证文件、IndexNow key，Pages 源 main/） |
| 部署链路 | push master → GitHub Actions（.github/workflows/deploy.yml，npm ci + hexo generate）→ gh-pages 分支 → Pages 发布 → IndexNow/百度主动推送 |

## 本站发布规则

- 文章入 `source/_posts/`，文件名 `YYYY-MM-DD-标题slug.md`
- 图片入 `source/images/`，正文引用 `/images/xxx`（渲染器 prependRoot 自动补 /impulsewave 前缀）
- front matter 由 AI 自动生成（title/date/description；author 由站点配置统一提供，不在文章里重复声明）
- description 由 AI 通读全文提炼要点（≤100 字）；文章不写 keywords（搜索引擎早已忽略，仅站点级保留）
- 每篇 3-5 条内链：至少 1 条到分类页、2 条到相关文章
- 图片必须有 alt

## SEO 发布检查清单

- [ ] front matter 含 `description`（≤100 字）
- [ ] 文中至少 3 条内链，其中 1 条指向分类页
- [ ] 图片有 alt，正文首图可作为 og:image（front matter `cover`）
- [ ] 本地 `npx hexo clean && npx hexo generate` 后，`public/sitemap.xml` 含新文章短链
- [ ] 新文章 head 中 canonical 与 og:url 一致、og:image 为绝对地址
- [ ] 旧文有实质修改时，确认 `article:modified_time` 已更新

## 星球内容发布规则（GitHub Issue 自动同步）

- 发布入口：仓库 Issues → 新建 Issue（用「🪐 星球发帖」表单更好，可直接选分类/标签/摘要/封面）。**仓库所有者创建的 Issue 默认就是星球帖，无需打 `planet` 标签**
- 收录规则：`tools/sync-planet.mjs` 拉取全部 Issue 后本地筛选——所有者创建的直接收录；他人创建的需带 `planet` 标签；Bot 创建的（utterances 评论机器人等）自动排除；PR 与 `status/draft` 跳过
- 分类来源优先级：Issue 表单的「分类」字段 → `cat/股票` 这类分类标签；都没有则无分类
- 自动同步：`planet-sync.yml` 监听 Issues 事件（工作流已加 `concurrency` 串行，避免同一次发帖的多事件并发推送冲突），由 `tools/sync-planet.mjs` 生成 `source/_posts/planet-<n>.md`，再显式触发 `deploy.yml` 部署（GITHUB_TOKEN 的提交不会触发 on:push）
- 帖子文件由脚本自动生成，**禁止手工修改** `planet-<n>.md`（下次同步会被覆盖）。要改内容请直接编辑原 Issue
- 精华/置顶：在 Issue 右侧加 `featured` / `pin` 标签；下线：关闭 Issue 即从站点移除
- 草稿：加 `status/draft` 标签则不同步
- 信息流首页：`/`（Stellar timeline 渲染），数据来自构建期生成的 `/planet-issues.json`（含 number/评论/点赞计数）；置顶帖由生成器排序前置。旧地址 `/planet/` 为跳转页，自动转回首页
- 首页交互（`source/js/planet-enhance.js`）：顶部标签聚合筛选（单选 + 「全部」重置）、长动态 >320px 自动折叠并可展开/收起、卡片底部懒加载 utterances 评论（`issue-number` 直连原 Issue）
- 帖子文章页：`comments: false` 关闭主题默认评论区，由同一脚本按 `planet.issue` 注入 issue-number 评论区 —— 卡片与文章页的讨论都收敛到同一个 Issue
- 浏览量徽章：侧栏组件（widgets.yml）+ 文章页 `#license` 区块（source/js/planet-badge.js 注入）
- 图床：Issue 中粘贴的图片使用 GitHub 官方图床（user-images.githubusercontent.com），暂不做本地转存

### 博客与星球的两套内容

星球帖有自己的文章页（`/posts/<abbrlink>/`），但**不进入**博客侧任何入口：列表 `/posts/`、`/archives/`、`/tags/`、`/categories/`、`atom.xml`、`sitemap.xml`、`/search.json`、侧栏「最近更新」、文章页「上一篇/下一篇」。

- 实现：`scripts/planet-isolation.js`。**星球帖判定依据是文件名 `_posts/planet-<Issue编号>.md`**（v2 对 front matter 做严格 schema 校验，不再写自定义 `planet:` 字段）。`hexo.locals` 的 `posts/tags/categories` 是「getter + 缓存」，而 `_runGenerators()` 每次生成前都会 `invalidate()` 再 `toObject()` 得到模板里的 `site.*`。所以在 `before_generate`（priority 2）里把 getter 换成过滤版本，所有消费方（含第三方 generator 与主题模板）一次性全部生效——不必逐个复制 `hexo-generator-index/archive/tag/category/feed/sitemap/searchdb` 的源码
- 必须晚于 Stellar 的 collection pipeline（priority 1）：该 pipeline 要为每篇文章构建 ViewModel，星球帖文章页渲染依赖它；若提前过滤，星球帖会因「缺少列表 ViewModel」渲染失败
- 代价：内置 `post` 生成器也被 `locals.posts` 驱动，星球帖文章页会跟着消失，因此在同一文件里覆盖了 `post` 生成器，改用原始 `Post` 模型取全量文章；`/planet-issues.json` 同理改读模型（`scripts/planet-generator.js`）并自行解析 Issue 编号
- 上一篇/下一篇：按内容类型分组串联，博客文章页不会出现「下一篇：星球帖」
- Issue 元数据（评论数/点赞/置顶/精华/checksum）统一存 `source/_data/planet-meta.json`；正文的 `visibility.searchable: false` 让星球帖不进本地搜索
- 升级注意：该方案依赖 `hexo.locals` 的内部结构（`getters`/`set`/`invalidate`），Hexo 大版本升级后必须回归验证上面 8 个入口

## 验证闭环

1. push 后确认仓库 Actions 页 Deploy 工作流 success（20~60 秒）
2. 确认 Pages 构建 built 无报错（gh api 或仓库 Pages 页）
3. 带 `?cachebust=<时间戳>` 抓取线上确认内容生效（CDN 缓存）

## 已知坑

- **Stellar v2 要求 Node 22+ / Hexo 8+**；本地构建必须用 `C:\Users\xuhui\.workbuddy\binaries\node\versions\22.12.0\node.exe`（PATH 里默认的 v20 会报 `Cannot read properties of undefined (reading 'override_pretty_urls')`）
- v2 配置结构与 v1 完全不同（`logo`/`menubar`/`site_tree`/`article.type`/`search.service`/`comments.service`/`inject.head` 全部失效）：改配置后先跑 `npx hexo stellar doctor`，PASS 且无 warnings 才算迁移到位
- v2 对 front matter 做严格 schema 校验：`indexing` → `visibility.searchable`、`menu_id` → `active_menu`、`comments: false` → `comments.enabled: false`、`type` → `article.style`；未知字段会被忽略并在构建时告警
- 站点 scripts 与主题 scripts 在 `loadScripts` 阶段同批加载，顺序不保证：需要包装主题 helper 时不能在脚本顶层 `helper.get()`，必须在 `generateBefore`/`ready` 里做
- 纯日期的 front matter date 会被 Hexo 按 UTC 解析 → URL 日期偏移一天：date 必须带时间
- git clone 安装的主题目录必须删除内部 .git，否则 Actions 构建缺主题
- 主题未识别的配置键会静默忽略：改配置后必须 grep 构建产物确认生效
- `config.url` 已含 `/impulsewave` 子路径，拼绝对地址只能用 `config.url + '/' + 相对路径`，再加 `config.root` 会出现 `/impulsewave/impulsewave/`
- 首页 `/` 不能用 `source/index.md`：Stellar 的 `path_normalize.js` 会把 Page 路径 `index.html` 归一为 `index/`（主题脚本注册晚于站点脚本，无法后置修正），必须用 `scripts/home-generator.js` 输出空路径路由
- 首页的 `comments_model` 需显式禁用：v2 通用 page 布局无条件调用该 helper，生成页没有源文件 → 会回落到全局 utterances（在首页凭空开 Issue）
- v2 构建会抓取页面图片补全尺寸/平均色（`features.image_optimization`），GitHub 附件图片在国内网络下可能超时，缓存写入 `source/_data/caches/images_metadata.json`（已加 gitignore）
- v2 文章页 canonical 由 `canonical.host + 去掉 config.root 的路由` 拼成，项目站下会缺 `/impulsewave`；`canonical.host` 不能写成 `域名/子路径`（客户端用 `btoa(host)` 校验克隆站，会误报），由 `scripts/canonical-subpath.js` 在渲染后补回子路径
- `404.html` 必须带 `sitemap: false`，否则会被写进 sitemap
- `robots.txt` 只在域名根生效：本仓库的 `source/robots.txt` 仅供本地对照，线上以 `mazhenren.github.io` 根仓库为准
- 站点未完成百度域名验证前，百度主动推送会返回错误（工作流按 best-effort 处理，不阻断构建）
