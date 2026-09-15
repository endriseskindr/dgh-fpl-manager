const fs = require("fs");
const data = fs.readFileSync("lib/dataService.ts", "utf8");
const hook = fs.readFileSync("hooks/useWarRoomData.ts", "utf8");
const client = fs.readFileSync("lib/fplClient.ts", "utf8");
const warRoomScreen = fs.readFileSync("app/(tabs)/index.tsx", "utf8");
const required = [
  [data, "loadCachedWarRoomData", "complete War Room snapshot loader exists"],
  [data, "persistWarRoomSnapshot(result)", "complete War Room snapshot persisted"],
  [data, "? fplCached.fixtures()", "fast path never requests full fixtures"],
  [data, "const result: WarRoomData", "fast/full result assembled before async snapshot persistence"],
  [data, "previousRivalById", "cached rival squads reused from one snapshot read"],
  [data, "if (!fast) { try { await saveGameweekSnapshot", "snapshot deferred until full enrichment"],
  [hook, "queryFn: loadCachedWarRoomData", "startup query is network-free"],
  [hook, "refreshWarRoomData(true, { fast: true })", "core refresh is background and coalesced"],
  [hook, "data.enrichmentComplete", "enrichment completion is checked before retriggering"],
  [hook, "enrichmentInFlight.current", "enrichment in-flight guard is present"],
  [hook, "refreshWarRoomData(false, { fast: false })", "background full enrichment exists"],
  [client, "const persisted = await cacheGet<T>(path);", "persistent cache checked"],
  [client, "const inFlight = new Map", "duplicate endpoint requests coalesced"],
  [client, "void cacheSet(path, data);", "cache persistence does not block API response"],
  [client, "persisted.cachedAt + ttlMs > Date.now()", "fresh persistent cache can satisfy launch"],
  [warRoomScreen, "if (!data) {", "interactive first-paint shell exists before data"],
  [warRoomScreen, "The app is ready.", "first-paint shell is user-facing and non-blocking"],
  [warRoomScreen, "InteractionManager.runAfterInteractions", "heavy analytics deferred until after interactions"],
  [fs.readFileSync("components/StatusStates.tsx", "utf8"), "export function LoadingShell", "skeleton loading state exists"],

];
const errors = required.filter(([src, needle]) => !src.includes(needle)).map(([, , label]) => label);
// Regex, not a hardcoded number: catches a regression to unbounded
// concurrency (no numeric bound, or an absurdly high one) without going
// stale every time this value is legitimately tuned, unlike the literal
// "mapWithConcurrency(rivalRows, 6" substring check this replaced (which
// silently broke when 3.6.7 raised the bound from 6 to 10).
const concurrencyMatch = data.match(/mapWithConcurrency\(rivalRows,\s*(\d+)/);
if (!concurrencyMatch) errors.push("bounded full-enrichment rival concurrency");
else {
  const n = Number(concurrencyMatch[1]);
  if (!(n > 0 && n <= 25)) errors.push(`rival concurrency bound (${n}) is outside the sane 1-25 range`);
}
if (/if \(isLoading\) return <LoadingBlock/.test(warRoomScreen)) errors.push("legacy blocking loading branch is absent");
if (errors.length) { console.error("PERFORMANCE PREFLIGHT FAILED\n - " + errors.join("\n - ")); process.exit(1); }
console.log("Performance preflight passed: fast-first startup, cached rivals, deferred snapshot, bounded background enrichment, and cache-first reads are present.");
