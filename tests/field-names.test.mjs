import assert from "node:assert/strict";
import test from "node:test";

import "../src/shared/alignment-engine.js";
import { el, makeDocument } from "./mini-dom.mjs";

const engine = globalThis.CardSorterEngine;

// 一组卡片,每张卡上放同样结构的一段 stats(row(i) 返回卡片里的数字那部分)
function discover(row, count = 8, lang = "") {
  const cards = [];
  for (let i = 0; i < count; i += 1) {
    cards.push(el("article", { class: "card" }, [
      el("a", { href: `/p/${i}` }, [el("img", { src: `/t/${i}.jpg`, width: "300", height: "200" })]),
      el("h3", { class: "title" }, [`Post title number ${i}`]),
      el("div", { class: "stats" }, row(i))
    ]));
  }
  const html = el("html", lang ? { lang } : {}, [el("body", {}, [el("main", {}, cards)])]);
  const doc = makeDocument(html, "https://names.test/");
  return engine.discover(doc).candidates.filter((c) => !c.excluded && c.type !== "text");
}

test("names stay in the site's own language: no translation", () => {
  const zh = discover((i) => [el("span", {}, [`${30 + i} 条评论`])], 8, "zh-CN");
  assert.equal(zh[0].canonicalId, "comments");
  assert.equal(zh[0].label, "评论数");
  const en = discover((i) => [el("span", {}, [`${30 + i} comments`])], 8, "en");
  assert.equal(en[0].canonicalId, "comments");
  assert.equal(en[0].label, "Comments");
});

test("a word the dictionary does not hold is shown as the site wrote it (喜欢 is not 收藏)", () => {
  const fields = discover((i) => [
    el("button", { "aria-label": "收藏" }, [String(100 + i * 3)]),
    el("button", { "aria-label": "喜欢" }, [String(50 + i * 7)])
  ], 8, "zh-CN");
  const names = fields.map((f) => f.label);
  assert.ok(names.includes("收藏数"), names.join(","));
  assert.ok(names.includes("喜欢"), names.join(","));
});

test("code names count only as whole words, never as a piece of a longer word", () => {
  // class 里整词 "comments" 认得出;"AnswerItem" 里的 "answer" 这种包在长串里的不算(只拆 - _ 大小写边界)
  const coded = discover((i) => [el("i", { class: "icon-comments" }), el("span", {}, [String(10 + i * 3)])], 8, "en");
  assert.equal(coded[0].canonicalId, "comments");
  assert.equal(coded[0].label, "Comments");
  const sentence = discover((i) => [el("span", {}, [`${1000 + i * 37} 人赞同了该回答`])], 8, "zh-CN");
  assert.notEqual(sentence[0].canonicalId, "answers");
  assert.equal(sentence[0].label, "人赞同了该回答");
});

test("the same number written twice in a card takes the name with fewer words", () => {
  const fields = discover((i) => {
    const n = String(1000 + i * 37);
    return [el("div", { class: "meta" }, [`${n} 人赞同了该回答`]), el("button", { class: "vote" }, [`赞同 ${n}`])];
  }, 8, "zh-CN");
  const vote = fields.find((f) => f.examples[0] === "1000" || /1,?000/.test(String(f.examples[0])));
  assert.ok(vote, fields.map((f) => f.label + ":" + f.examples[0]).join(" | "));
  assert.equal(vote.label, "赞同");
});

// 卡片上看得见四舍五入的数,代码里藏着同一个数的精确值(<meta itemprop="upvoteCount" content="...">)
function exactCards(withShown, oddCard = -1) {
  const cards = [];
  for (let i = 0; i < 8; i += 1) {
    const exact = 108332 + i * 5170;
    // oddCard:这张卡的代码里藏的是别的数(和看得见的对不上)
    const parts = [el("meta", { itemprop: "upvoteCount", content: String(i === oddCard ? 50 : exact) })];
    if (withShown) parts.push(el("button", { class: "vote" }, [`赞同 ${(exact / 10000).toFixed(1)} 万`]));
    cards.push(el("article", { class: "card" }, [
      el("a", { href: `/p/${i}` }, [el("img", { src: `/t/${i}.jpg`, width: "300", height: "200" })]),
      el("h3", { class: "title" }, [`第 ${i} 篇文章的标题`]),
      el("div", { class: "stats" }, parts)
    ]));
  }
  const html = el("html", { lang: "zh-CN" }, [el("body", {}, [el("main", {}, cards)])]);
  return engine.discover(makeDocument(html, "https://names.test/"));
}

test("a hidden exact number joins the visible rounded one: one column, the visible name, sorted by the exact value", () => {
  const result = exactCards(true);
  const fields = result.candidates.filter((c) => !c.excluded && c.type !== "text");
  assert.equal(fields.length, 1, fields.map((f) => f.label).join(","));
  assert.equal(fields[0].label, "赞同");
  assert.equal(fields[0].kind, "text");
  assert.equal(result.items[0].metrics[fields[0].id], 108332);
  assert.equal(result.items[3].metrics[fields[0].id], 108332 + 3 * 5170);
  assert.equal(result.items[0].metricRaw[fields[0].id], "赞同 10.8 万","the card still shows what the site shows");
});

test("a card whose hidden number disagrees with what it shows is sorted by what it shows", () => {
  const result = exactCards(true, 5);
  const fields = result.candidates.filter((c) => !c.excluded && c.type !== "text");
  assert.equal(fields.length, 1, fields.map((f) => f.label).join(","));
  assert.equal(fields[0].label, "赞同");
  assert.equal(result.items[0].metrics[fields[0].id], 108332);
  assert.equal(result.items[5].metrics[fields[0].id], 134000,"13.4 万 as shown, not the hidden 50");
});

test("a hidden number with no visible twin never becomes a menu item of its own", () => {
  const result = exactCards(false);
  const fields = result.candidates.filter((c) => !c.excluded && c.type !== "text");
  assert.equal(fields.length, 0, fields.map((f) => f.label).join(","));
  const hidden = result.candidates.find((c) => c.canonicalId === "likes");
  assert.ok(hidden && hidden.excluded, "kept in the not-sortable list");
  assert.equal(hidden.label, "点赞数", "named in the page language from its own code name");
});
