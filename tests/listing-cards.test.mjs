import assert from "node:assert/strict";
import test from "node:test";

import "../src/shared/alignment-engine.js";
import { el, makeDocument } from "./mini-dom.mjs";

const engine = globalThis.CardSorterEngine;

function page(cards, url = "https://example.com/stays") {
  return makeDocument(el("body", {}, [el("div", { class: "results" }, cards)]), url);
}

const ratings = ["4.97", "4.5", "5.0", "4.82", "4.6", "4.91", "4.7", "4.88", "4.4", "4.95"];

// 房源卡片:class 名是乱码,标题只用 data-testid 标出;评分和评价数写在同一句话里
function stay(i) {
  const reviews = 3 + i * 11;
  return el("div", { class: "c1x9 a7f2" }, [
    el("a", { href: `/rooms/${1000 + i}` }, [el("img", { src: `/pics/${i}.jpg`, alt: "" })]),
    el("div", { "data-testid": "listing-card-title" }, [`Cabin number ${i}`]),
    el("span", { "data-testid": "listing-card-name" }, [`Quiet place ${i}`]),
    el("span", { class: "q1" }, [`${(i % 4) + 1} ${i % 4 ? "bedrooms" : "bedroom"}`]),
    el("span", { class: "q2" }, [`${(i % 3) + 1} ${i % 3 ? "baths" : "bath"}`]),
    el("span", { class: "r1" }, [`${ratings[i]} out of 5 average rating, ${reviews} reviews`]),
    el("span", { class: "p1" }, [`$${200 + i * 37}`])
  ]);
}

const result = engine.discover(page(Array.from({ length: 10 }, (_, i) => stay(i))));
const field = (re) => result.candidates.find((c) => !c.excluded && re.test(c.label || ""));

test("a unit letter followed by more letters is part of the word, not a unit (bedrooms, baths)", () => {
  const bedrooms = field(/bedroom/i);
  const baths = field(/bath/i);
  assert.ok(bedrooms, "bedrooms field keeps its full name");
  assert.ok(baths, "baths field keeps its full name");
  assert.equal(result.items[2].metrics[bedrooms.id], 3);
  assert.equal(result.items[2].metrics[baths.id], 3);
});

test("number units written right after the number still work: 3m, 1.2k, 4b", () => {
  assert.equal(engine.parseNumber("3m"), 3e6);
  assert.equal(engine.parseNumber("1.2k"), 1200);
  assert.equal(engine.parseNumber("4b"), 4e9);
  assert.equal(engine.parseNumber("3 bedrooms"), 3);
});

test("rating and review count written in one sentence become two fields", () => {
  const rating = result.candidates.find((c) => !c.excluded && c.canonicalId === "score");
  const reviews = result.candidates.find((c) => !c.excluded && c.canonicalId === "reviews");
  assert.ok(rating, "rating field");
  assert.ok(reviews, "review count field");
  assert.equal(result.items[0].metrics[rating.id], 4.97);
  assert.equal(result.items[0].metrics[reviews.id], 3);
  assert.equal(result.items[4].metrics[reviews.id], 47);
});

test("the title comes from a data-testid title when nothing else marks it", () => {
  assert.equal(result.items[5].title, "Cabin number 5");
});

function numberFields(texts, { all = false } = {}) {
  const cards = texts.map((t, i) => el("div", { class: "card" }, [
    el("a", { href: `/item/${i}` }, [el("h3", {}, [`Item ${i}`])]),
    el("span", { class: "info" }, [t])
  ]));
  return engine.discover(page(cards)).candidates.filter((c) => (all || !c.excluded) && c.type === "number");
}

test("'4.5/5' and thousands commas are not split into pieces", () => {
  const slash = numberFields(Array.from({ length: 8 }, (_, i) => `${(3 + i * 0.2).toFixed(1)}/5 rating`), { all: true });
  assert.equal(slash.length, 1);
  const thousands = numberFields(Array.from({ length: 8 }, (_, i) => `${1 + i},${100 + i * 3} ratings`));
  assert.equal(thousands.length, 1);
});

test("separators: comma, semicolon, middle dot, vertical bar, slash between words, CJK commas all split", () => {
  for (const sep of [", ", "; ", " · ", " | ", " / ", "，", "、"]) {
    const found = numberFields(Array.from({ length: 8 }, (_, i) => `${10 + i} likes${sep}${200 + i * 7} comments`));
    assert.equal(found.length, 2, `separator "${sep}"`);
  }
});
