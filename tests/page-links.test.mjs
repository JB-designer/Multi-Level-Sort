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
