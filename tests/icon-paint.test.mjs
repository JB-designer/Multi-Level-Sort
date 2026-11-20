import assert from "node:assert/strict";
import test from "node:test";

import "../src/shared/alignment-engine.js";
import { el, makeDocument } from "./mini-dom.mjs";

const engine = globalThis.CardSorterEngine;

// 原页面用 CSS(不是属性)给图标上色/去色:style 记录每个元素在页面上算出来的 fill / stroke
function pageWithIcons(makeIcons, styleOf) {
  const view = { getComputedStyle: (element) => styleOf(element) };
  const cards = [];
  for (let i = 0; i < 8; i += 1) {
    cards.push(el("article", { class: "card" }, [
      el("a", { href: `/m/${i}` }, [el("img", { src: `/t/${i}.jpg`, width: "300", height: "200" })]),
      el("h3", { class: "title" }, [`Model number ${i}`]),
      el("div", { class: "stats" }, makeIcons(i))
    ]));
  }
  const doc = makeDocument(el("body", {}, [el("main", { class: "grid" }, cards)]), "https://models.test/list");
  doc.defaultView = view;
  for (const node of doc.body.descendants()) node.ownerDocument = doc;
  return doc;
}

function iconsOf(doc) {
  return engine.discover(doc).candidates.filter((c) => !c.excluded).map((c) => c.icon && c.icon.markup);
}

test("an outline icon styled by CSS stays an outline; a filled one stays filled", () => {
  const OUTLINE = () => el("svg", { viewBox: "0 0 24 24", class: "outline" }, [el("path", { d: "M12 3v12m-5-5l5 5 5-5" })]);
  const SOLID = () => el("svg", { viewBox: "0 0 24 24", class: "solid" }, [el("path", { d: "M12 2l3 6 6 1-5 4 1 6-5-3-5 3 1-6-5-4 6-1z" })]);
  const doc = pageWithIcons(
    (i) => [el("span", { class: "a1" }, [OUTLINE()]), el("span", { class: "b2" }, [String(100 + i * 37)]),
      el("span", { class: "a1" }, [SOLID()]), el("span", { class: "c3" }, [String(20 + i * 3)])],
    (element) => {
      let svg = element;
      while (svg && svg.tagName !== "SVG") svg = svg.parentElement;
      const outline = svg && svg.className === "outline";
      return { fill: outline ? "none" : "rgb(0, 0, 0)", stroke: outline ? "rgb(9, 9, 9)" : "none" };
    }
  );
  const [outline, solid] = iconsOf(doc);
  assert.equal(outline, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v12m-5-5l5 5 5-5"></path></svg>');
  assert.equal(solid, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l3 6 6 1-5 4 1 6-5-3-5 3 1-6-5-4 6-1z"></path></svg>');
});

test("without page styles the copy is unchanged", () => {
  const doc = pageWithIcons(
    (i) => [el("span", { class: "a1" }, [el("svg", { viewBox: "0 0 24 24" }, [el("path", { d: "M1 1h2", fill: "#123" })])]),
      el("span", { class: "b2" }, [String(100 + i * 37)])],
    () => ({})
  );
  assert.deepEqual(iconsOf(doc), ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h2" fill="currentColor"></path></svg>']);
});
