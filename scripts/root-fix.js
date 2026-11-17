/**
 * 修复 Stellar 在「非根路径部署」时的面包屑双前缀问题。
 *
 * 主题 layout/_partial/main/navbar/article_banner.ejs 用 pretty_url(config.root)
 * 生成「主页」面包屑链接；config.root 本身已含站点前缀（/impulsewave/），
 * pretty_url 又补了一次 root，输出 /impulsewave/impulsewave/（404）。
 * 这里在 HTML 写盘前把重复的一层前缀折叠掉，不改 node_modules（npm ci 会覆盖）。
 *
 * 只在 root 非 '/' 时生效；对正常链接零影响。
 */
'use strict';

const root = String(hexo.config.root || '/');
// '/impulsewave/' → '/impulsewave'；'/' → ''
const trimmed = root.replace(/\/+$/, '');

if (trimmed) {
  const single = `${trimmed}/`;
  const doubled = `${trimmed}${trimmed}/`;
  // 部分标签的 href 被 escape_html 转义成 &#x2F; 形式，两种都处理
  const esc = s => s.replace(/\//g, '&#x2F;');
  const singleEsc = esc(single);
  const doubledEsc = esc(doubled);

  hexo.extend.filter.register('after_render:html', function (html) {
    if (typeof html !== 'string' || !html) return html;
    if (html.indexOf(doubled) === -1 && html.indexOf(doubledEsc) === -1) return html;
    return html.split(doubled).join(single).split(doubledEsc).join(singleEsc);
  }, 10);

  hexo.log.info('[root-fix] 折叠重复站点前缀：%s → %s', doubled, single);
}
