import assert from "node:assert/strict";
import test from "node:test";

import { distinguishCollidingLinks, pagesLookIdentical } from "../src/core/pagination.js";

const range = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));

test("cards whose links differ only after ? get told apart, pages no longer look identical", () => {
  const page1 = distinguishCollidingLinks(range(12, () => "/"), range(12, (i) => `/?item=${i}`));
  const page2 = distinguishCollidingLinks(range(12, () => "/"), range(12, (i) => `/?item=${i + 12}`));
  assert.equal(new Set(page1).size, 12);
  assert.equal(pagesLookIdentical(page2, page1), false);
  // 真的同一页仍然判为重复
  assert.equal(pagesLookIdentical(page1, page1.slice()), true);
});

test("pages where the old signature already works are untouched", () => {
  const sigs = range(20, (i) => `/item/${i}`);
  assert.deepEqual(distinguishCollidingLinks(sigs, sigs.map((s) => `${s}?ref=list`)), sigs);
});

test("a few colliding cards (at or under 30%) keep the old signature", () => {
  // 42 张卡里 3 张广告链接只差 ? 后面:多出来的 2 张 = 5%
  const sigs = [...range(39, (i) => `/video/${i}`), "/ad", "/ad", "/ad"];
  const links = [...range(39, (i) => `/video/${i}`), "/ad?x=1", "/ad?x=2", "/ad?x=3"];
  assert.deepEqual(distinguishCollidingLinks(sigs, links), sigs);
});

test("the same card shown twice (same full link) stays one identity", () => {
  // 一页 26 张,6 张是完全相同的重复卡片(链接一模一样)
  const sigs = [...range(20, (i) => `/plugin/${i}`), ...range(6, (i) => `/plugin/${i}`)];
  assert.deepEqual(distinguishCollidingLinks(sigs, sigs), sigs);
});

test("only the colliding cards switch to the full link", () => {
  const sigs = [...range(6, () => "/"), "/about", "/help"];
  const links = [...range(6, (i) => `/?item=${i}`), "/about", "/help"];
  const ids = distinguishCollidingLinks(sigs, links);
  assert.equal(ids[6], "/about");
  assert.equal(ids[7], "/help");
  assert.equal(new Set(ids.slice(0, 6)).size, 6);
});
