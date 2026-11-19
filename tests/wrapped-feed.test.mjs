import assert from "node:assert/strict";
import test from "node:test";

import "../src/shared/alignment-engine.js";
import { el, makeDocument, MiniElement } from "./mini-dom.mjs";

const engine = globalThis.CardSorterEngine;

// 模拟浏览器里的排版:每个元素都"显示着",大小取自 data-w / data-h(没写就是 0)
MiniElement.prototype.getClientRects = function () { return [{}]; };
MiniElement.prototype.getBoundingClientRect = function () {
  const w = Number(this.getAttribute("data-w") || 0);
  const h = Number(this.getAttribute("data-h") || 0);
  return { x: 0, y: 0, width: w, height: h, top: 0, left: 0, right: w, bottom: h };
};

// 纯文字的信息流卡片(没有图),中间隔着几层包装
function post(i) {
  return el("div", { class: "Card FeedItem", "data-w": 660, "data-h": 155 }, [
    el("h2", { class: "ContentItem-title" }, [el("a", { href: `/question/${100 + i}` }, [`Question number ${i} about something`])]),
    el("div", { class: "RichContent" }, [`Writer ${i}: a short plain text excerpt for this answer.`]),
    el("div", { class: "ContentItem-actions" }, [
      el("button", { class: "VoteButton" }, [`赞同 ${(i + 1) * 37}`]),
      el("a", { href: `/question/${100 + i}#comments`, class: "Comments" }, [`${(i + 2) * 11} 条评论`])
    ])
  ]);
}

// 旁边的推荐关注:3 页轮播,每页 4 人,共 12 个
function person(i) {
  return el("div", { class: "AuthorInfo", "data-w": 200, "data-h": 45 }, [
    el("img", { src: `/avatar/${i}.png`, alt: "" }),
    el("img", { src: "/badge.png", alt: "" }),
    el("a", { href: `/people/${i}`, class: "UserLink-name" }, [`Person ${i}`]),
    el("button", {}, ["关注"])
  ]);
}

function homePage(count) {
  const column = el("div", { class: "Main-column", "data-w": 700, "data-h": 155 * count + 120 }, [
    el("div", { class: "Composer" }, [el("img", { src: "/me.png", alt: "" }), el("a", { href: "/write" }, ["Write"])]),
    el("div", { class: "Feed-recommend" }, [
      el("div", {}, [el("div", { class: "ListShortcut" }, Array.from({ length: count }, (_, i) => post(i)))])
    ])
  ]);
  const side = el("div", { class: "Side-column" }, [
    el("div", { class: "Recommend-follow" }, [
      el("div", { class: "Carousel" }, Array.from({ length: 12 }, (_, i) => person(i)))
    ])
  ]);
  return makeDocument(el("body", {}, [el("div", { class: "Layout" }, [column, side])]), "https://example.test/home");
}

for (const count of [3, 8, 12]) {
  test(`a text-only feed of ${count} cards inside a higher-scoring column still wins over a 12-item sidebar carousel`, () => {
    const result = engine.discover(homePage(count));
    assert.ok(result.ok, "cards found");
    assert.equal(result.cardCount, count);
    assert.match(result.signature, /feeditem/i);
    const numbers = result.candidates.filter((c) => !c.excluded && c.type !== "text");
    assert.ok(numbers.length >= 2, "vote and comment numbers are readable");
  });
}

test("a real card group that contains small repeated parts keeps the cards (bigger area wins)", () => {
  const card = (i) => el("div", { class: "Card Item", "data-w": 300, "data-h": 400 }, [
    el("a", { href: `/item/${i}`, class: "Item-title" }, [`Item number ${i}`]),
    el("span", {}, [`${(i + 1) * 120} views`]),
    el("ul", {}, [0, 1, 2].map((k) => el("li", { class: "Thumb", "data-w": 60, "data-h": 40 }, [
      el("a", { href: `/item/${i}/pic/${k}` }, [el("img", { src: `/p/${i}-${k}.jpg`, alt: "" })]),
      el("span", { class: "Thumb-name" }, [`Pic ${k} ${i}`])
    ])))
  ]);
  const doc = makeDocument(el("body", {}, [el("div", { class: "Grid" }, Array.from({ length: 6 }, (_, i) => card(i)))]), "https://example.test/grid");
  const result = engine.discover(doc);
  assert.ok(result.ok);
  assert.equal(result.cardCount, 6);
  assert.match(result.signature, /card.item/i);
});
