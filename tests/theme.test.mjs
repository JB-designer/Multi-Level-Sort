import test from "node:test";
import assert from "node:assert/strict";
import { normalize, resolve, flip } from "../src/core/theme.js";
import { readFileSync } from "node:fs";

test("unknown stored values fall back to following the system", () => {
  for (const v of [undefined, null, "", "blue", 1]) assert.equal(normalize(v), "auto");
  assert.equal(normalize("light"), "light");
  assert.equal(normalize("dark"), "dark");
});

test("auto follows the system; an explicit choice wins", () => {
  assert.equal(resolve("auto", true), "dark");
  assert.equal(resolve("auto", false), "light");
  assert.equal(resolve("light", true), "light");
  assert.equal(resolve("dark", false), "dark");
});

test("the header button flips what is on screen", () => {
  assert.equal(flip("auto", true), "light");
  assert.equal(flip("auto", false), "dark");
  assert.equal(flip("light", false), "dark");
  assert.equal(flip("dark", true), "light");
});

test("button copy exists in both languages", () => {
  const src = readFileSync(new URL("../src/core/i18n.js", import.meta.url), "utf8");
  for (const s of ["切换到深色模式", "切换到浅色模式", "Switch to dark mode", "Switch to light mode"]) assert.ok(src.includes(s), s);
});
