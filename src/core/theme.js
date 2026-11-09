// Multi-Level Sort · https://github.com/JB-designer/Multi-Level-Sort · MIT License
/*
 * 浅色 / 深色主题。
 *   存一个全局值(所有网站共用):"auto" | "light" | "dark",默认 "auto" = 跟随系统。
 *   标题栏按钮只在浅色和深色之间切换;点过一次之后就以用户的选择为准。
 *   面板、收起胶囊、弹窗和结果页都读同一个值。
 */

export const STORAGE_KEY = "cardSorterTheme";

export function normalize(value) {
  return value === "light" || value === "dark" ? value : "auto";
}

// 实际显示的主题
export function resolve(stored, prefersDark) {
  var v = normalize(stored);
  if (v === "auto") return prefersDark ? "dark" : "light";
  return v;
}

// 点一下按钮之后要存的值
export function flip(stored, prefersDark) {
  return resolve(stored, prefersDark) === "dark" ? "light" : "dark";
}

export function prefersDark() {
  try { return Boolean(globalThis.matchMedia && globalThis.matchMedia("(prefers-color-scheme: dark)").matches); }
  catch (error) { return false; }
}

export async function load() {
  try { return normalize((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]); }
  catch (error) { return "auto"; }
}

export async function save(value) {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalize(value) });
}
