import assert from "node:assert/strict";
import test from "node:test";

import "../src/shared/alignment-engine.js";
import { el, makeDocument } from "./mini-dom.mjs";

const engine = globalThis.CardSorterEngine;

test("a long date with an ordinal day and a clock time is a date, not a duration", () => {
  const texts = [
    "Tuesday, November 10th 2026, 9:09:12 AM",
    "Monday, November 2nd 2026, 4:15:00 PM",
    "Sunday, November 1st 2026, 11:30:45 AM",
    "Friday, October 23rd 2026, 7:05:09 PM"
  ];
  assert.equal(engine.detectSlotType(texts).type, "date");
  assert.equal(new Date(engine.parseDateIso(texts[0])).getDate(), 10);
});

test("a clock-style length stays a duration", () => {
  assert.equal(engine.detectSlotType(["12:34", "1:02:03", "45:10", "3:59"]).type, "duration");
});

// 点赞按钮上只有样式名 duration-300(动画时长),没有写给人看的名字
function post(i) {
  return el("div", { class: "post-card" }, [
    el("a", { href: `/p/${i}`, class: "post-title" }, [`Thread title ${i}`]),
    el("button", { class: "relative", type: "button" }, [
      el("div", { class: "group/accessory flex size-12 gap-1 rounded-xl border-2 transition-all duration-300 hover:border-brand-500" }, [
        el("svg", { class: "size-[14px] stroke-[1.5px] transition-all duration-300" }, []),
        el("p", { class: "text-sm font-semibold leading-none" }, [String((i + 1) * 17)])
      ])
    ])
  ]);
}

test("a style class like duration-300 is not used as a field name", () => {
  const doc = makeDocument(el("body", {}, [el("div", { class: "feed" }, Array.from({ length: 6 }, (_, i) => post(i)))]));
  const result = engine.discover(doc);
  assert.ok(result.ok);
  const votes = result.candidates.find((c) => !c.excluded && c.examples && c.examples.includes("17"));
  assert.ok(votes, "the vote number is found");
  assert.doesNotMatch(String(votes.label || "") + " " + String(votes.siteLabel || ""), /duration|时长/i);
  assert.notEqual(votes.type, "duration");
});
