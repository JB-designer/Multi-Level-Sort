import assert from "node:assert/strict";
import test from "node:test";

import { chooseFollowLinks, makeFollowLinksTemplate, describeCollectOutcome } from "../src/core/pagination.js";

const base = "https://stays.example/s/lake/homes?adults=2&nights=3";
const cursor = (n) => base + "&cursor=" + Buffer.from(JSON.stringify({ offset: 18 * (n - 1) })).toString("base64");
const row = (numbers, group = 0) => numbers.map((n) => ({ text: String(n), href: cursor(n), group }));

test("sites whose page links follow a URL pattern keep using it (no link following)", () => {
  const anchors = [2, 3, 4, 20].map((n) => ({ text: String(n), href: `https://shop.example/list?page=${n}`, group: 0 }));
  assert.equal(chooseFollowLinks(anchors, "https://shop.example/list", 1), null);
  const paths = [2, 3, 9].map((n) => ({ text: String(n), href: `https://blog.example/tag/x/page/${n}/`, group: 0 }));
  assert.equal(chooseFollowLinks(paths, "https://blog.example/tag/x/", 1), null);
});

test("page links with only an encoded cursor are followed one by one; the total is the biggest number", () => {
  const choice = chooseFollowLinks(row([2, 3, 4, 15]), base, 1);
  assert.ok(choice);
  assert.equal(choice.total, 15);
  assert.equal(choice.links.get(2), cursor(2));
});

test("only the row that holds the next number is used (numbers elsewhere on the page are ignored)", () => {
  const anchors = row([7, 8, 9], 0).concat(row([2, 3, 4, 15], 1));
  const choice = chooseFollowLinks(anchors, base, 1);
  assert.deepEqual([...choice.links.keys()], [2, 3, 4, 15]);
});

test("no link to the next number → nothing to follow", () => {
  assert.equal(chooseFollowLinks(row([5, 6]), base, 1), null);
});

test("the template learns the next links from each page it reads, and says when a link is missing", () => {
  const template = makeFollowLinksTemplate(chooseFollowLinks(row([2, 3, 4, 15]), base, 1));
  assert.equal(template.make(2), cursor(2));
  assert.equal(template.has(5), false);
  assert.throws(() => template.make(5));
  template.learn(row([1, 2, 3, 5, 6, 15]), base, 4);
  assert.equal(template.make(5), cursor(5));
  template.learn(row([1, 2]), base, 6); // 第 6 页上没有 7 → 不收
  assert.equal(template.has(7), false);
});

test("stopping because the next page link is missing is said plainly", () => {
  const text = describeCollectOutcome({ requested: [1, 2, 3, 4, 5], stored: [1, 2, 3], noLinkAfter: 3 });
  assert.match(text, /第 3 页上没有第 4 页的链接/);
});
