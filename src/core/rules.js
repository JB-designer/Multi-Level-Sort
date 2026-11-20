// Multi-Level Sort · https://github.com/JB-designer/Multi-Level-Sort · MIT License
/*
 * 站点规则存储:用户勾选后的字段配置,按 "origin + 路径骨架" 保存。
 *
 * 路径骨架归一化(已与用户确认):
 *   - 忽略 query 与 hash(/search?q=cat 与 ?q=dog 同一规则)
 *   - 纯数字/分页形态的路径段 → "*"(/videos/page/2 与 /videos/page/3 同一规则)
 *   - 其余路径段原样保留(/videos 与 /channels 是两套规则)
 *   - 网址末尾的页码(/page/2、/p/3、/page-2)去掉:第 1 页 /videos 和第 2 页 /videos/page/2 是同一个列表
 *     (以前按带 "/page/*" 的写法保存过的设置,读取时仍能找到,见 legacyRuleKey)
 */

const STORAGE_KEY = "cardSorterSiteRules";
export const RULE_VERSION = 1;

export function normalizePathSkeleton(pathname) {
  return skeletonOf(pathname, true);
}

function skeletonOf(pathname, dropTrailingPage) {
  const decodedSegments = String(pathname || "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => safeDecode(segment).toLowerCase());
  if (dropTrailingPage) {
    // 末尾的 "page/2"、"p/3" 或 "page-2"、"page2" 是页码,不是另一个列表
    for (;;) {
      const last = decodedSegments[decodedSegments.length - 1];
      const before = decodedSegments[decodedSegments.length - 2];
      if (last != null && /^(?:page|p|paged)[-_]?\d+$/.test(last)) { decodedSegments.pop(); continue; }
      if (last != null && /^\d+$/.test(last) && /^(?:page|p|paged)$/.test(before || "")) { decodedSegments.length -= 2; continue; }
      break;
    }
  }
  const segments = decodedSegments.map((decoded) => {
    if (/^\d+$/.test(decoded)) return "*";
    if (/^(?:page|p|paged)[-_]?\d+$/.test(decoded)) return "*";
    if (/^\d{4}-\d{2}(?:-\d{2})?$/.test(decoded)) return "*";
    return decoded;
  });
  return "/" + segments.join("/");
}

export function makeRuleKey(url) {
  return keyOf(url, true);
}

// 以前(不去掉末尾页码时)的保存位置:旧设置还在那里,读取和删除时一起看
export function legacyRuleKey(url) {
  return keyOf(url, false);
}

function keyOf(url, dropTrailingPage) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin.toLowerCase()}${skeletonOf(parsed.pathname, dropTrailingPage)}`;
  } catch {
    return "";
  }
}

export function makeRule({ url, cardSignature = "", candidates = [], existing = null }) {
  const now = Date.now();
  return {
    version: RULE_VERSION,
    key: makeRuleKey(url),
    origin: safeOrigin(url),
    pathSkeleton: normalizePathSkeleton(safePathname(url)),
    cardSignature,
    slots: candidates.map((candidate) => ({
      id: candidate.id,
      path: candidate.path,
      textIndex: candidate.textIndex ?? null,
      kind: candidate.kind,
      attr: candidate.attr || "",
      pairLabel: candidate.pairLabel || "",
      altPaths: candidate.altPaths || [],
      type: candidate.type,
      siteLabel: candidate.siteLabel || "",
      label: candidate.label || candidate.siteLabel || "",
      canonicalId: candidate.canonicalId || "",
      source: candidate.source || "",
      excluded: Boolean(candidate.excluded),
      suspect: Boolean(candidate.suspect),
      icon: candidate.icon || null,
      enabled: candidate.enabled != null ? Boolean(candidate.enabled) : Boolean(candidate.preChecked)
    })),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

export async function getRuleForUrl(url) {
  const key = makeRuleKey(url);
  if (!key) return null;
  const rules = await readAllRules();
  return rules[key] || rules[legacyRuleKey(url)] || null;
}

export async function saveRule(rule) {
  if (!rule?.key) throw new Error("Rule key missing");
  const rules = await readAllRules();
  rules[rule.key] = rule;
  await writeAllRules(rules);
  return rule;
}

export async function deleteRule(key) {
  const rules = await readAllRules();
  if (rules[key]) {
    delete rules[key];
    await writeAllRules(rules);
  }
}

// 「重置网站」:新旧两个保存位置都清掉
export async function deleteRuleForUrl(url) {
  const rules = await readAllRules();
  let changed = false;
  for (const key of new Set([makeRuleKey(url), legacyRuleKey(url)])) {
    if (key && rules[key]) { delete rules[key]; changed = true; }
  }
  if (changed) await writeAllRules(rules);
}

async function readAllRules() {
  const storage = globalThis.chrome?.storage?.local;
  if (!storage) return {};
  const stored = await storage.get(STORAGE_KEY);
  return stored?.[STORAGE_KEY] || {};
}

async function writeAllRules(rules) {
  const storage = globalThis.chrome?.storage?.local;
  if (!storage) return;
  await storage.set({ [STORAGE_KEY]: rules });
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeOrigin(url) {
  try {
    return new URL(url).origin.toLowerCase();
  } catch {
    return "";
  }
}

function safePathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
}
