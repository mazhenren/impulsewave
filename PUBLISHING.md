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
| 主题配置 | _config.next.yml（alternate theme config）+ source/_data/styles.styl（自定义样式注入） |
| 默认分支 | master（源码）/ gh-pages（成品，禁手改） |
| 站点子路径 | /impulsewave/ |
| 部署链路 | push master → GitHub Actions（.github/workflows/deploy.yml，npm ci + hexo generate）→ gh-pages 分支 → Pages 发布 |

## 本站发布规则

- 文章入 `source/_posts/`，文件名 `YYYY-MM-DD-标题slug.md`
- 图片入 `source/images/`，正文引用 `/images/xxx`（渲染器 prependRoot 自动补 /impulsewave 前缀）
- front matter 由 AI 自动生成（title/date/author/description）；存档键剥离与署名规则以各用户自己的配置为准
- description 由 AI 通读全文提炼要点（≤100 字）

## 验证闭环

1. push 后确认仓库 Actions 页 Deploy 工作流 success（20~60 秒）
2. 确认 Pages 构建 built 无报错（gh api 或仓库 Pages 页）
3. 带 `?cachebust=<时间戳>` 抓取线上确认内容生效（CDN 缓存）

## 已知坑

- 纯日期的 front matter date 会被 Hexo 按 UTC 解析 → URL 日期偏移一天：date 必须带时间
- git clone 安装的主题目录必须删除内部 .git，否则 Actions 构建缺主题
- 主题未识别的配置键会静默忽略：改配置后必须 grep 构建产物确认生效
