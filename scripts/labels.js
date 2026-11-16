/**
 * 站点文案覆盖：把主题内置多语言里的「博客」改为「专栏」。
 *
 * 主题 zh-CN.yml 里有若干写死的标签（如搜索范围 scope_blog = 博客），
 * 站点配置无法直接改；这里在 generateBefore 阶段包装 hexo.theme.i18n.__，
 * 只替换下表列出的键，其余文案保持主题原值。
 */
'use strict';

const LABELS = {
  'menu.blog': '专栏',
  'btn.blog': '专栏',
  'search.scope_blog': '专栏'
};

hexo.on('generateBefore', () => {
  const i18n = hexo.theme.i18n;
  if (!i18n || typeof i18n.__ !== 'function' || i18n.__.__labels) return;
  const original = i18n.__;
  const wrapped = function (lang) {
    const translate = original.call(this, lang);
    return function (key, ...args) {
      const mapped = Object.prototype.hasOwnProperty.call(LABELS, key) ? LABELS[key] : key;
      return translate(mapped, ...args);
    };
  };
  wrapped.__labels = true;
  i18n.__ = wrapped;
});
