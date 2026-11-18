import assert from "node:assert/strict";
import test from "node:test";

import "../src/shared/alignment-engine.js";
import { el, makeDocument } from "./mini-dom.mjs";

const engine = globalThis.CardSorterEngine;

// 列表页:每张卡一张图、一个标题、一段 meta 文字
function listing(metaOf, count = 12, cardClass = "card", metaClass = "meta") {
  const cards = [];
  for (let i = 0; i < count; i += 1) {
    cards.push(el("li", { class: cardClass }, [
      el("a", { href: `/item/${100 + i}` }, [el("img", { src: `/t/${i}.jpg`, alt: "" })]),
      el("h3", {}, [el("a", { href: `/item/${100 + i}` }, [`Sample item ${String.fromCharCode(65 + i)}`])]),
      el("div", { class: metaClass }, [el("span", {}, [metaOf(i)])])
    ]));
  }
  return makeDocument(el("body", {}, [el("ul", { class: "list" }, cards)]), "https://example.test/list");
}

function valuesOf(result, type) {
  const field = result.candidates.find((c) => c.type === type && !c.excluded);
  assert.ok(field, `a ${type} field should exist`);
  return result.items.map((item) => item.metrics[field.id]);
}

test("units 千 / 千万 / 百万 are read as numbers", () => {
  assert.equal(engine.parseNumber("3千"), 3000);
  assert.equal(engine.parseNumber("3.2千"), 3200);
  assert.equal(engine.parseNumber("1千万"), 10000000);
  assert.equal(engine.parseNumber("2百万"), 2000000);
  assert.equal(engine.parseNumber("1.2万"), 12000);
});

test("hour-and-minute durations keep their minutes", () => {
  assert.equal(engine.parseDurationSeconds("1h 30m"), 5400);
  assert.equal(engine.parseDurationSeconds("1h30m"), 5400);
  assert.equal(engine.parseDurationSeconds("45m"), 2700);
  assert.equal(engine.parseDurationSeconds("2 小时 5 分钟"), 7500);
  assert.equal(engine.parseDurationSeconds("1h 30min"), 5400);
});

test("cards showing '1h 30m' style lengths sort as durations", () => {
  const doc = listing((i) => `${1 + (i % 3)}h ${10 + i}m`);
  const result = engine.discover(doc, { pageUrl: doc.location.href });
  assert.equal(result.ok, true);
  const values = valuesOf(result, "duration");
  assert.equal(values[0], 3600 + 600);
  assert.equal(values[4], 2 * 3600 + 14 * 60);
});

test("a labelled clock duration ('Duration: 1:02:00') is read as a duration", () => {
  const lengths = ["1:02:00", "59:00", "10:30", "10:05", "2:00:00", "0:45", "12:00", "1:00:01", "3:15", "44:44", "5:05", "20:00"];
  const doc = listing((i) => `Duration: ${lengths[i]} Views: ${(i + 1) * 37}`);
  const result = engine.discover(doc, { pageUrl: doc.location.href });
  assert.equal(result.ok, true);
  const values = valuesOf(result, "duration");
  assert.deepEqual(values.slice(0, 4), [3720, 3540, 630, 605]);
});
