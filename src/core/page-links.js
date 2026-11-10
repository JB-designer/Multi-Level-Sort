// Multi-Level Sort · https://github.com/JB-designer/Multi-Level-Sort · MIT License
/*
 * 哪些"文字是数字的链接"算页码链接。
 * 同一份结果既用来判断"这个页面有没有分页"(默认标签),也用来算总页数、学翻页网址、逐个点链接翻页,
 * 这样判断和翻页用的是同一套证据,不会出现"说有分页、却翻不了页"。
 *
 * 一个数字链接算页码链接,要同时满足:
 *   1. 不在卡片里(卡片里的数字是这张卡片的数据,如浏览数、回复数、帖子自己的小分页);
 *   2. 它所在的那一排有 ≥2 个不同的数字链接;
 *      或者它单独一个,数字 = 当前页 + 1,同一个网站,并且网址能证明它是下一页:
 *        和当前页同一个地址(只有页码部分不同),或者这个数字作为单独一段写在网址最后一段路径
 *        或某个参数值里(/latest/2、index_2.html、list_12_2.html、?pg=2)。
 *
 * anchors: [{ text, href, group, row?, inCard? }]
 *   group  = 链接所在的父元素(旧的分组,下游照旧用)
 *   row    = 去掉只包着这个链接的外壳之后的那一排(没有时用 group)
 *   inCard = 链接在找到的卡片里面(没找到卡片时都是 false,这一条就不起作用)
 * 返回原数组里符合条件的那些对象(同一批对象,不复制)。
 */

const NUMBER_TEXT = /^\d{1,5}$/;

// 从页面(或读到的别的页)里收集所有文字是数字的链接,还没筛。
// group = 链接所在的那一排(同一个父元素;链接包在 li 里时看 li 的父元素)—— 旧分组,下游照旧用
// row   = 跳过只包着这个链接的外壳(span、li…)之后的那一排,用来数一排里有几个不同的数字
// inCard = 在 cardRoots 的某张卡片里;bar = group 对应的元素
// background.js 在后台标签页里有一份同样的收集代码(那里不能 import),改这里时一起改。
export function collectNumberLinks(root, { skip = null, cardRoots = [], baseUrl = "" } = {}) {
  const anchors = [];
  const bars = [];
  const rows = [];
  root.querySelectorAll("a[href]").forEach((a) => {
    if (skip && skip.contains(a)) return;
    const text = (a.textContent || "").trim();
    if (!NUMBER_TEXT.test(text)) return;
    const parent = a.parentElement;
    const bar = parent && (parent.tagName === "LI" ? parent.parentElement : parent);
    let group = bars.indexOf(bar);
    if (group < 0) { bars.push(bar); group = bars.length - 1; }
    let rowEl = parent;
    while (rowEl && rowEl.parentElement && (rowEl.textContent || "").trim() === text) rowEl = rowEl.parentElement;
    let row = rows.indexOf(rowEl);
    if (row < 0) { rows.push(rowEl); row = rows.length - 1; }
    const inCard = (cardRoots || []).some((card) => card === a || card.contains(a));
    anchors.push({ text, href: hrefOf(a, baseUrl), group, row, inCard, bar });
  });
  return anchors;
}

function hrefOf(a, baseUrl) {
  if (typeof a.href === "string" && a.href) return a.href;
  const raw = a.getAttribute("href");
  try {
    return new URL(raw, baseUrl || undefined).href;
  } catch {
    return raw;
  }
}

export function selectPageLinks(anchors, baseUrl, currentPage = 1) {
  const list = (anchors || []).filter((a) => a && !a.inCard && NUMBER_TEXT.test(String(a.text || "").trim()));
  const rows = new Map();
  for (const a of list) {
    const key = rowKey(a);
    if (!rows.has(key)) rows.set(key, new Set());
    rows.get(key).add(Number(String(a.text).trim()));
  }
  return list.filter((a) => {
    if (rows.get(rowKey(a)).size >= 2) return true;
    const n = Number(String(a.text).trim());
    return n === currentPage + 1 && (sameListAddress(a.href, baseUrl) || addressCarriesNumber(a.href, baseUrl, n));
  });
}

function rowKey(anchor) {
  if (anchor.row != null) return "r" + anchor.row;
  if (anchor.group != null) return "g" + anchor.group;
  return "all";
}

// 两个网址是不是同一个列表(只有页码部分不同):同一个网站,路径去掉页码部分后相同。
// 参数(?page=2、?cursor=…)不看:翻页常常只改参数。
export function sameListAddress(href, baseUrl) {
  let a;
  let b;
  try {
    a = new URL(href, baseUrl);
    b = new URL(baseUrl);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(a.protocol) || a.origin !== b.origin) return false;
  return pathStem(a.pathname) === pathStem(b.pathname);
}

// 同一个网站,并且数字 n 作为单独一段出现在网址最后一段路径或某个参数值里
// (按非字母数字切开:index_2.html → index / 2 / html;page2、p2 也算)。
export function addressCarriesNumber(href, baseUrl, n) {
  let a;
  let b;
  try {
    a = new URL(href, baseUrl);
    b = new URL(baseUrl);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(a.protocol) || a.origin !== b.origin) return false;
  const wanted = String(n);
  const hasToken = (text) => {
    let value = String(text || "");
    try { value = decodeURIComponent(value); } catch { /* keep raw */ }
    return value.split(/[^A-Za-z0-9]+/).some((token) => {
      const m = /^(?:page|p)?0*(\d{1,5})$/i.exec(token);
      return Boolean(m) && m[1] === wanted;
    });
  };
  const segments = a.pathname.split("/").filter(Boolean);
  if (segments.length && hasToken(segments[segments.length - 1])) return true;
  for (const value of a.searchParams.values()) if (hasToken(value)) return true;
  return false;
}

// 路径去掉页码部分:/list/2 、/list/page/2/ 、/list/p-2 、/list_2.html → /list 、/list.html
export function pathStem(pathname) {
  const out = [];
  for (const raw of String(pathname || "").split("/")) {
    if (!raw) continue;
    let segment = raw;
    try { segment = decodeURIComponent(raw); } catch { /* keep raw */ }
    if (/^\d{1,5}$/.test(segment)) {
      if (out.length && /^(?:page|p)$/i.test(out[out.length - 1])) out.pop();
      continue;
    }
    if (/^(?:page|p)[-_]?\d{1,5}(?:\.[a-z0-9]{2,5})?$/i.test(segment)) continue;
    out.push(segment.replace(/[-_]\d{1,5}(\.[a-z0-9]{2,5})?$/i, "$1"));
  }
  return "/" + out.join("/");
}
