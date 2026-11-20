import assert from "node:assert/strict";
import test from "node:test";

import "../src/shared/alignment-engine.js";
import { el, makeDocument } from "./mini-dom.mjs";

const engine = globalThis.CardSorterEngine;

// 按钮里先有一个看不见的字符和图标,再是数字;按钮自己写着名字(aria-label)
function button(name, count) {
  return el("button", { "aria-label": name, class: "action" }, [el("span", {}, ["​", el("svg", {}, [])]), `${count} `]);
}

function card(i, extraLayer) {
  const actions = el("div", { class: "actions" }, [button("Saves", 10 + i * 7), button("Hearts", 3 + i * 5)]);
  return el("div", { class: "card" }, [
    el("a", { href: `/post/${i}` }, [el("img", { src: `/p/${i}.jpg`, alt: "" }), el("h3", {}, [`Post number ${i}`])]),
    extraLayer ? el("div", { class: "wrap" }, [actions]) : actions
  ]);
}

test("an invisible character is never used as a field name; the button's own name is", () => {
  const doc = makeDocument(el("body", {}, [el("div", { class: "list" }, Array.from({ length: 6 }, (_, i) => card(i, false)))]), "https://example.test/");
  const result = engine.discover(doc);
  const labels = result.candidates.filter((c) => !c.excluded && c.type === "number").map((c) => c.label);
  assert.ok(labels.every((label) => label.replace(/[​\s]/g, "") !== ""), `no blank names: ${JSON.stringify(labels)}`);
  assert.ok(labels.some((label) => /Saves/.test(label)), "Saves");
  assert.ok(labels.some((label) => /Hearts/.test(label)), "Hearts");
});

test("the same named number is read on cards with two different layouts", () => {
  const cards = Array.from({ length: 9 }, (_, i) => card(i, i % 3 === 0));
  const doc = makeDocument(el("body", {}, [el("div", { class: "list" }, cards)]), "https://example.test/");
  const result = engine.discover(doc);
  const hearts = result.candidates.find((c) => !c.excluded && /Hearts/.test(c.label));
  assert.ok(hearts, "Hearts field");
  assert.equal(hearts.coverage.count, 9);
});
