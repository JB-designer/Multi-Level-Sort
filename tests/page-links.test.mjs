import assert from "node:assert/strict";
import test from "node:test";

import "../src/shared/alignment-engine.js";
import { el, makeDocument } from "./mini-dom.mjs";
import { collectNumberLinks, selectPageLinks, sameListAddress, pathStem, addressCarriesNumber } from "../src/core/page-links.js";
import { detectTotalPages } from "../src/core/page-range.js";
import { chooseFollowLinks, makePageUrlTemplates } from "../src/core/pagination.js";

const engine = globalThis.CardSorterEngine;

// 同 panel.js:找卡片 → 收集数字链接 → 筛出页码链接
function pageLinksOf(body, url, page = 1, { useCards = true } = {}) {
  const doc = makeDocument(body, url);
  const cardRoots = useCards ? engine.findCards(doc).roots : [];
  return selectPageLinks(collectNumberLinks(doc, { cardRoots, baseUrl: url }), url, page);
}

const texts = (links) => links.map((a) => a.text);

// 一张帖子卡片:标题链接 + 作者 + 一个数字链接(浏览数等)
function post(i, numberLink) {
  return el("article", { class: "post" }, [
    el("a", { href: `/u${i}/status/${1000 + i}` }, [el("h3", {}, [`Post number ${i} title`])]),
    el("span", { class: "author" }, [`author${i}`]),
    el("span", { class: "likes" }, [`${10 + i * 7} likes`]),
    el("div", { class: "actions" }, [el("a", { href: `/u${i}/status/${1000 + i}/analytics` }, [numberLink(i)])])
  ]);
}

test("a number link inside a card (a view count) is not a page link", () => {
  const body = el("body", {}, [el("main", { class: "feed" }, Array.from({ length: 8 }, (_, i) => post(i, (n) => String(239 + n))))]);
  const doc = makeDocument(body, "https://social.example/home");
  const roots = engine.findCards(doc).roots;
  assert.ok(roots.length >= 6, "cards are found");
  const raw = collectNumberLinks(doc, { cardRoots: roots, baseUrl: "https://social.example/home" });
  assert.equal(raw.length, 8);
  assert.ok(raw.every((a) => a.inCard));
  assert.deepEqual(pageLinksOf(body, "https://social.example/home"), []);
});

test("a post with exactly 2 views is not a link to page 2 (in a card, or alone when no cards are found)", () => {
  const url = "https://social.example/home";
  const body = el("body", {}, [el("main", { class: "feed" }, Array.from({ length: 8 }, (_, i) => post(i, () => "2")))]);
  assert.deepEqual(pageLinksOf(body, url), []);
  // 找不到卡片时:单独一个 "2",但指向别的地址(帖子的统计页)→ 也不算
  const lone = el("body", {}, [el("div", { class: "row" }, [el("span", {}, ["3 replies"]), el("a", { href: "/u1/status/1001/analytics" }, ["2"])])]);
  assert.deepEqual(pageLinksOf(lone, url, 1, { useCards: false }), []);
  // 以前的判断会把它当成能点的下一页
  assert.ok(chooseFollowLinks([{ text: "2", href: "https://social.example/u1/status/1001/analytics", group: 0 }], url, 1));
});

test("a 2-page list whose pager shows only \"2\" still counts as paged", () => {
  for (const [url, href] of [
    ["https://shop.example/list?q=lamp", "/list?q=lamp&page=2"],
    ["https://blog.example/tag/x/", "/tag/x/page/2/"],
    ["https://videos.example/videos", "/videos/2"],
    ["https://forum.example/board.html", "/board_2.html"]
  ]) {
    const body = el("body", {}, [el("div", { class: "nav" }, [el("span", { class: "current" }, ["1"]), el("a", { href }, ["2"])])]);
    const links = pageLinksOf(body, url, 1, { useCards: false });
    assert.deepEqual(texts(links), ["2"], url);
    // 翻页网址从这同一份链接里学(这种 _2.html 写法的网址学不出,与本次改动无关)
    if (!href.endsWith(".html")) assert.equal(makePageUrlTemplates(links, url)[0].make(2), new URL(href, url).href, url);
  }
});

test("a forum's per-thread mini pager inside each row is ignored; the list's own pager is kept", () => {
  const url = "https://forum.example/board";
  const thread = (i) => el("div", { class: "thread" }, [
    el("a", { href: `/thread/${500 + i}` }, [el("h3", {}, [`Thread title ${i}`])]),
    el("span", { class: "replies" }, [`${20 + i * 3} replies`]),
    el("span", { class: "pages" }, [
      el("a", { href: `/thread/${500 + i}?page=1` }, ["1"]),
      el("a", { href: `/thread/${500 + i}?page=2` }, ["2"]),
      el("a", { href: `/thread/${500 + i}?page=3` }, ["3"]),
      el("a", { href: `/thread/${500 + i}?page=12` }, ["12"])
    ])
  ]);
  const pager = el("ul", { class: "nav" }, [2, 3, 4, 105].map((n) => el("li", {}, [el("a", { href: `/board?page=${n}` }, [String(n)])])));
  const body = el("body", {}, [el("section", { class: "threads" }, Array.from({ length: 8 }, (_, i) => thread(i))), pager]);
  const links = pageLinksOf(body, url);
  assert.deepEqual(texts(links), ["2", "3", "4", "105"]);
  assert.ok(links.every((a) => a.href.startsWith("https://forum.example/board?page=")));
  assert.equal(detectTotalPages(links, url, 1), 105);
});

test("a lone \"2\" in a sidebar that points to a different address is not a page link", () => {
  const url = "https://shop.example/list";
  const body = el("body", {}, [el("aside", {}, [el("span", {}, ["Unread"]), el("a", { href: "/messages/inbox" }, ["2"])])]);
  assert.deepEqual(pageLinksOf(body, url, 1, { useCards: false }), []);
  // 已知的取舍:网址最后一段就是这个数字时(/levels/2)会被当成下一页,和以前一样
  const carried = el("body", {}, [el("aside", {}, [el("span", {}, ["Level"]), el("a", { href: "/levels/2" }, ["2"])])]);
  assert.deepEqual(texts(pageLinksOf(carried, url, 1, { useCards: false })), ["2"]);
  // 同一个 "2" 指向这个列表的第 2 页时才算
  const real = el("body", {}, [el("aside", {}, [el("span", {}, ["Page"]), el("a", { href: "/list/2" }, ["2"])])]);
  assert.deepEqual(texts(pageLinksOf(real, url, 1, { useCards: false })), ["2"]);
});

test("a lone number that is not the next page is not a page link, whatever its address", () => {
  const url = "https://shop.example/list?page=3";
  const body = el("body", {}, [el("div", { class: "nav" }, [el("a", { href: "/list?page=5" }, ["5"])])]);
  assert.deepEqual(pageLinksOf(body, url, 3, { useCards: false }), []);
  const next = el("body", {}, [el("div", { class: "nav" }, [el("a", { href: "/list?page=4" }, ["4"])])]);
  assert.deepEqual(texts(pageLinksOf(next, url, 3, { useCards: false })), ["4"]);
});

test("a pager whose links each sit in their own wrapper still counts as one row", () => {
  const url = "https://shop.example/s?k=lamp";
  const item = (n) => el("li", {}, [el("span", { class: "item" }, [el("a", { href: `/s?k=lamp&page=${n}` }, [String(n)])])]);
  const body = el("body", {}, [el("ul", { class: "strip" }, [el("li", {}, [el("span", {}, ["1"])]), item(2), item(3), el("li", {}, [el("span", {}, ["…"])]), item(20)])]);
  const links = pageLinksOf(body, url, 1, { useCards: false });
  assert.deepEqual(texts(links), ["2", "3", "20"]);
  assert.equal(new Set(links.map((a) => a.row)).size, 1);
  assert.equal(new Set(links.map((a) => a.group)).size, 3, "the old grouping is kept for the code downstream");
});

test("a row with two or more different numbers counts as before, even on another address", () => {
  const url = "https://stays.example/s/lake/homes?adults=2";
  const anchors = [2, 3, 4, 15].map((n) => ({ text: String(n), href: `https://stays.example/s/lake/homes?cursor=c${n}`, group: 0 }));
  assert.equal(selectPageLinks(anchors, url, 1).length, 4);
  const elsewhere = [2, 3].map((n) => ({ text: String(n), href: `https://other.example/x/${n}`, group: 1 }));
  assert.equal(selectPageLinks(elsewhere, url, 1).length, 2);
  // 同一个数字出现两次不算两个数字
  const twice = [{ text: "7", href: "https://other.example/a", group: 2 }, { text: "7", href: "https://other.example/b", group: 2 }];
  assert.deepEqual(selectPageLinks(twice, url, 1), []);
});

test("links that come without card or row info (older callers) fall back to the old grouping", () => {
  const url = "https://shop.example/list";
  const anchors = [{ text: "2", href: "https://shop.example/list?page=2", group: 0 }, { text: "3", href: "https://shop.example/list?page=3", group: 0 }];
  assert.equal(selectPageLinks(anchors, url, 1).length, 2);
});

test("same list address: only the page-number parts of the path may differ", () => {
  assert.equal(pathStem("/tag/x/page/2/"), "/tag/x");
  assert.equal(pathStem("/list/p-3"), "/list");
  assert.equal(pathStem("/board_2.html"), "/board.html");
  assert.equal(pathStem("/u1/status/2119950518659535023/analytics"), "/u1/status/2119950518659535023/analytics");
  assert.equal(sameListAddress("https://a.example/list?page=2", "https://a.example/list"), true);
  assert.equal(sameListAddress("https://b.example/list?page=2", "https://a.example/list"), false);
  assert.equal(sameListAddress("javascript:void(0)", "https://a.example/list"), false);
});

test("a lone next-page link counts when its address itself carries the number (even on another path)", () => {
  const lone = (url, href, text = "2", page = 1) => {
    const body = el("body", {}, [el("div", { class: "nav" }, [el("span", {}, ["1"]), el("a", { href }, [text])])]);
    return texts(pageLinksOf(body, url, page, { useCards: false }));
  };
  assert.deepEqual(lone("https://cms.example/news/", "/news/index_2.html"), ["2"]);
  assert.deepEqual(lone("https://cms.example/news/", "/news/list_12_2.html"), ["2"]);
  assert.deepEqual(lone("https://cms.example/", "/latest/2"), ["2"]);
  assert.deepEqual(lone("https://cms.example/", "/latest/2/"), ["2"]);
  assert.deepEqual(lone("https://cms.example/news/", "/archive?pg=2"), ["2"]);
  assert.deepEqual(lone("https://cms.example/news/", "/archive/page2.html"), ["2"]);
  assert.deepEqual(lone("https://cms.example/news/index_2.html", "/news/index_3.html", "3", 2), ["3"]);
});

test("still rejected: a count link to a post's stats page, any link inside a card, a link to another site", () => {
  const url = "https://social.example/home";
  // 帖子编号里含 2、文字是 2,但最后一段是 analytics
  const stats = el("body", {}, [el("div", { class: "row" }, [el("span", {}, ["3 replies"]), el("a", { href: "/u2/status/2119950518659535022/analytics" }, ["2"])])]);
  assert.deepEqual(pageLinksOf(stats, url, 1, { useCards: false }), []);
  assert.equal(addressCarriesNumber("https://social.example/u2/status/2119950518659535022/analytics", url, 2), false);
  // 卡片里的链接,网址里写着 2 也不算
  const cards = el("body", {}, [el("main", { class: "feed" }, Array.from({ length: 8 }, (_, i) => post(i, () => "2")))]);
  const doc = makeDocument(cards, url);
  const raw = collectNumberLinks(doc, { cardRoots: engine.findCards(doc).roots, baseUrl: url });
  raw.forEach((a) => { a.href = "https://social.example/latest/2"; });
  assert.ok(raw.every((a) => a.inCard));
  assert.deepEqual(selectPageLinks(raw, url, 1), []);
  // 别的网站
  assert.deepEqual(selectPageLinks([{ text: "2", href: "https://other.example/list?page=2", group: 0 }], "https://shop.example/list", 1), []);
  assert.equal(addressCarriesNumber("https://other.example/latest/2", "https://shop.example/", 2), false);
  // 数字只是更长数字的一部分(20、12)不算
  assert.equal(addressCarriesNumber("https://shop.example/latest/20", "https://shop.example/", 2), false);
  assert.equal(addressCarriesNumber("https://shop.example/item?id=12", "https://shop.example/", 2), false);
});

test("on the last page of a 2-page list, a lone link to the previous page counts, and the total is the current page", () => {
  for (const href of ["/list?page=1", "/list"]) {
    const url = "https://shop.example/list?page=2";
    const body = el("body", {}, [el("ul", { class: "nav" }, [el("li", {}, [el("span", {}, [el("a", { href }, ["1"])])]), el("li", { class: "on" }, [el("span", {}, ["2"])])])]);
    const links = pageLinksOf(body, url, 2, { useCards: false });
    assert.deepEqual(texts(links), ["1"], href);
    if (href.includes("page=1")) assert.equal(detectTotalPages(links, url, 2), 2);
  }
  // 上一页的数字指向别的地址 → 不算;不相邻的单个数字也不算
  const url = "https://shop.example/list?page=3";
  const other = el("body", {}, [el("div", {}, [el("span", {}, ["Inbox"]), el("a", { href: "/inbox" }, ["2"])])]);
  assert.deepEqual(pageLinksOf(other, url, 3, { useCards: false }), []);
  const far = el("body", {}, [el("div", { class: "nav" }, [el("a", { href: "/list?page=1" }, ["1"])])]);
  assert.deepEqual(pageLinksOf(far, url, 3, { useCards: false }), []);
});

test("a pager whose numbers are each wrapped with a separator (\"2 |\", \"[2]\", \"2,\") is still one row", () => {
  const url = "https://forum.example/category/mods/";
  const href = (n) => `/category/mods/page/${n}/`;
  const nums = [2, 3, 4, 12];
  const variants = {
    bar: el("ul", { class: "nav" }, [el("li", {}, ["1 |"])].concat(nums.map((n) => el("li", {}, [el("a", { href: href(n) }, [String(n)]), " |"])))),
    brackets: el("table", {}, [el("tr", {}, [el("td", {}, ["[1]"])].concat(nums.map((n) => el("td", {}, ["[", el("a", { href: href(n) }, [String(n)]), "]"]))))]),
    commas: el("div", { class: "nav" }, [el("span", {}, ["1,"])].concat(nums.map((n) => el("span", {}, [el("a", { href: href(n) }, [String(n)]), ","]))))
  };
  for (const [name, pager] of Object.entries(variants)) {
    const links = pageLinksOf(el("body", {}, [pager]), url, 1, { useCards: false });
    assert.deepEqual(texts(links), ["2", "3", "4", "12"], name);
    assert.equal(new Set(links.map((a) => a.row)).size, 1, name);
    assert.equal(detectTotalPages(links, url, 1), 12, name);
  }
  // 外壳里有别的字时不往上合并:卡片里的 "(2 replies)" 这类仍是单独一个
  const text = el("body", {}, [el("div", {}, [el("span", {}, [el("a", { href: "/thread/9" }, ["2"]), " replies"]), el("span", {}, [el("a", { href: "/thread/9/likes" }, ["5"]), " likes"])])]);
  const raw = collectNumberLinks(makeDocument(text, url), { baseUrl: url });
  assert.notEqual(raw[0].row, raw[1].row);
});

test("separator-wrapped mini pagers inside forum rows stay out; the list's own pager is kept", () => {
  const url = "https://forum.example/board";
  const mini = (i) => el("span", { class: "pages" }, [1, 2, 3, 12].map((k) => el("span", {}, ["[", el("a", { href: `/thread/${500 + i}?page=${k}` }, [String(k)]), "]"])));
  const thread = (i) => el("div", { class: "thread" }, [
    el("a", { href: `/thread/${500 + i}` }, [el("h3", {}, [`Thread title ${i}`])]),
    el("span", { class: "replies" }, [`${20 + i * 3} replies`]),
    mini(i)
  ]);
  const pager = el("div", { class: "nav" }, [2, 3, 30].map((n) => el("span", {}, [el("a", { href: `/board?page=${n}` }, [String(n)]), " |"])));
  const links = pageLinksOf(el("body", {}, [el("section", { class: "threads" }, Array.from({ length: 8 }, (_, i) => thread(i))), pager]), url);
  assert.deepEqual(texts(links), ["2", "3", "30"]);
  assert.equal(detectTotalPages(links, url, 1), 30);
});

test("link following uses the same row: a separator-wrapped pager whose addresses show no pattern reads all its numbers", () => {
  const url = "https://cms.example/list/list_12_1.html";
  const pager = el("table", {}, [el("tr", {}, [el("td", {}, ["Pages:"]), el("td", {}, ["[1]"])].concat([2, 3, 4, 12].map((n) => el("td", {}, ["[", el("a", { href: `/list/list_12_${n}.html` }, [String(n)]), "]"]))))]);
  const links = pageLinksOf(el("body", {}, [pager]), url, 1, { useCards: false });
  assert.equal(new Set(links.map((a) => a.group)).size, 4, "each number has its own parent");
  const choice = chooseFollowLinks(links, url, 1);
  assert.ok(choice);
  assert.equal(choice.total, 12);
  assert.equal(choice.links.get(2), "https://cms.example/list/list_12_2.html");
});

test("lone numbers in a sidebar and a footer are not merged into one row with each other", () => {
  const url = "https://shop.example/list/";
  const grid = el("div", { class: "grid" }, Array.from({ length: 6 }, (_, i) => el("div", { class: "item" }, [el("a", { href: `/item/${i}` }, [`Book title number ${i} with a long name`])])));
  const pager = el("div", { class: "pg" }, [el("span", {}, ["1"]), " ", el("a", { href: "/list/?page=2" }, ["2"]), " ", el("a", { href: "/list/?page=3" }, ["3"])]);
  const body = el("body", {}, [el("aside", {}, [el("a", { href: "/cart" }, ["7"])]), grid, pager, el("footer", {}, [el("a", { href: "/help/faq" }, ["2"])])]);
  const raw = collectNumberLinks(makeDocument(body, url), { baseUrl: url });
  assert.notEqual(raw[0].row, raw[raw.length - 1].row, "sidebar 7 and footer 2 are separate rows");
  const links = selectPageLinks(raw, url, 1);
  assert.deepEqual(links.map((a) => a.href), ["https://shop.example/list/?page=2", "https://shop.example/list/?page=3"]);
  assert.equal(chooseFollowLinks(links, url, 1), null, "the URL pattern is used, not the footer link");
});

test("a separator-wrapped pager that shares its list with one long info item is still one row", () => {
  const url = "https://forum.example/category/mods/";
  const href = (n) => `/category/mods/page/${n}/`;
  const info = el("li", {}, ["Showing 1-6 of 72 mods in category Special Edition Graphics and Textures"]);
  const pager = el("ul", { class: "nav" }, [info, el("li", {}, [el("em", {}, ["1"]), " |"])].concat([2, 3, 4, 5].map((n) => el("li", {}, [el("a", { href: href(n) }, [String(n)]), " |"])), [el("li", {}, ["…"]), el("li", {}, [el("a", { href: href(12) }, ["12"]), " |"]), el("li", {}, [el("a", { href: href(2) }, ["Next »"])])]));
  const links = pageLinksOf(el("body", {}, [pager]), url, 1, { useCards: false });
  assert.deepEqual(texts(links), ["2", "3", "4", "5", "12"]);
  assert.equal(new Set(links.map((a) => a.row)).size, 1);
  assert.equal(detectTotalPages(links, url, 1), 12);
  // 中间隔着一块内容(长、并且有链接)时,两边分成两段
  const block = el("li", {}, [el("a", { href: "/item/1" }, ["A long block of related content with its own link inside it"])]);
  const split = el("ul", {}, [el("li", {}, [el("a", { href: href(2) }, ["2"]), " |"]), block, el("li", {}, [el("a", { href: "/elsewhere/9" }, ["9"]), " |"])]);
  const raw = collectNumberLinks(makeDocument(el("body", {}, [split]), url), { baseUrl: url });
  assert.notEqual(raw[0].row, raw[1].row);
});

test("a lone next-page link that is the current address plus the number (index2.html, list2) counts; other letters+2 addresses do not", () => {
  assert.equal(addressCarriesNumber("https://cms.example/index2.html", "https://cms.example/index.html", 2), true);
  assert.equal(addressCarriesNumber("https://cms.example/two/list2.html", "https://cms.example/two/list.html", 2), true);
  assert.equal(addressCarriesNumber("https://cms.example/two/list2", "https://cms.example/two/list", 2), true);
  assert.equal(addressCarriesNumber("https://cms.example/index12.html", "https://cms.example/index.html", 2), false);
  assert.equal(addressCarriesNumber("https://cms.example/other/index2.html", "https://cms.example/index.html", 2), false);
  // 没有分页的页面上:"Also in this series: 2" → /game/diablo2,"2 new replies" → /forum/h2
  assert.equal(addressCarriesNumber("https://cms.example/game/diablo2", "https://cms.example/category/mods/", 2), false);
  assert.equal(addressCarriesNumber("https://cms.example/forum/h2", "https://cms.example/category/mods/", 2), false);
  assert.equal(addressCarriesNumber("https://cms.example/game/diablo2", "https://cms.example/game/diablo", 2), true, "only when it really is the current address + 2");
  const url = "https://cms.example/category/mods/";
  const body = el("body", {}, [el("aside", {}, [el("h4", {}, ["Series"]), el("p", {}, ["Also in this series: ", el("a", { href: "/game/diablo2" }, ["2"])])]), el("header", {}, [el("a", { href: "/forum/h2" }, ["2"]), " new replies"])]);
  assert.deepEqual(pageLinksOf(body, url, 1, { useCards: false }), []);
  assert.equal(addressCarriesNumber("https://social.example/u2/status/2119950518659535022/analytics", "https://social.example/home", 2), false);
});

test("a long text item inside the run of numbers does not split the row", () => {
  const url = "https://forum.example/category/mods/";
  const href = (n) => `/category/mods/page/${n}/`;
  const li = (n) => el("li", {}, [el("a", { href: href(n) }, [String(n)]), " |"]);
  const jump = el("li", {}, [el("span", { class: "jump" }, ["Page 1 of 12 - type a page number and press Enter to jump there"]), " |"]);
  const pager = el("ul", { class: "nav" }, [el("li", {}, [el("em", {}, ["1"]), " |"]), li(2), li(3), li(4), li(5), jump, li(12)]);
  const links = pageLinksOf(el("body", {}, [pager]), url, 1, { useCards: false });
  assert.deepEqual(texts(links), ["2", "3", "4", "5", "12"]);
  assert.equal(new Set(links.map((a) => a.row)).size, 1);
  assert.equal(detectTotalPages(links, url, 1), 12);
});
