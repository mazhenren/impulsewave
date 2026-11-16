/**
 * 彻底停用 Stellar 的 timeline（GitHub Issues 动态时间线）功能。
 *
 * 停用三件事，缺一不可：
 *   1. 标签插件：注销主题注册的 {% timeline %}，避免再产出 timeline 结构
 *      （主题 tags/index.js 注册；本仓库已无任何文章使用该标签）
 *   2. 运行时服务：主题的 services.js 只要发现 .ds-timeline / .ds-memos 就动态加载
 *      source/js/services/timeline.js 并拉取 data-api。构建期清掉这两个类名与
 *      data-service 属性，服务就永远不会被加载（源码核实：services.js 第 149-159 行）
 *   3. 站点信息流：首页容器改为 .planet-feed（见 scripts/home-generator.js），
 *      不再复用 .tag-plugin.timeline 的样式与语义
 *
 * 该文件只做减法，不改动其他标签/服务；非 timeline 页面原样返回。
 */
'use strict';

const DISABLED_TAGS = ['timeline'];

let disabled = false;
let strippedTotal = 0;

hexo.on('generateBefore', () => {
  if (disabled) return;
  disabled = true;
  DISABLED_TAGS.forEach(name => {
    try {
      // unregister 无返回值，先查环境里是否真的有这个扩展，日志才有意义
      const env = hexo.extend.tag.env;
      const existed = !!(env && typeof env.hasExtension === 'function' && env.hasExtension(name));
      hexo.extend.tag.unregister(name);
      hexo.log.info('[planet-timeline-off] 标签 {% %s %} 已注销%s', name, existed ? '' : '（主题未注册）');
    } catch (err) {
      hexo.log.warn('[planet-timeline-off] 注销标签 %s 失败：%s', name, err.message);
    }
  });
});

/** 从 class 属性中剔除 ds-timeline / ds-memos */
function stripServiceClasses(html) {
  return html.replace(/class=(["'])([^"']*)\1/g, (m, quote, value) => {
    const classes = value.split(/\s+/).filter(Boolean);
    const kept = classes.filter(c => c !== 'ds-timeline' && c !== 'ds-memos');
    if (kept.length === classes.length) return m;
    strippedTotal += classes.length - kept.length;
    return 'class=' + quote + kept.join(' ') + quote;
  });
}

hexo.extend.filter.register('after_render:html', function (html) {
  if (typeof html !== 'string' || !html) return html;
  if (html.indexOf('ds-timeline') === -1 && html.indexOf('ds-memos') === -1 &&
      !/data-service=["'](timeline|memos)["']/i.test(html)) {
    return html;
  }
  try {
    const out = stripServiceClasses(html)
      .replace(/\sdata-service=(["'])(?:timeline|memos)\1/gi, '');
    if (out !== html) {
      hexo.log.warn('[planet-timeline-off] 已清理 timeline 残留结构');
    }
    return out;
  } catch (err) {
    hexo.log.warn('[planet-timeline-off] 清理失败，原样输出：%s', err.message);
    return html;
  }
}, 10);

hexo.on('generateAfter', () => {
  if (strippedTotal > 0) {
    hexo.log.warn('[planet-timeline-off] 本次共移除 %d 处 timeline 服务类名', strippedTotal);
  }
});
