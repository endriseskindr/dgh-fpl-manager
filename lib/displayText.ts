/**
 * Safe display-text normalization for manager/team names pulled from the FPL
 * API. Some entries come through with encoding corruption (mojibake) —
 * usually double-encoded UTF-8 (e.g. "Ã©" where "é" was intended) or literal
 * U+FFFD replacement characters where the source bytes were already lost.
 *
 * Rules (issue #28):
 *  - Never touch the authoritative entry/player ID — this only affects what
 *    is shown on screen.
 *  - Recover double-encoded UTF-8 where it round-trips cleanly (the common,
 *    reliably-fixable case).
 *  - Never fabricate characters that were already lost (U+FFFD) — replace
 *    them with a neutral marker rather than guessing at the original text.
 *  - Never strip or mangle legitimate international characters (accents,
 *    non-Latin scripts, emoji) that are already valid Unicode.
 */

const REPLACEMENT_CHAR = "\uFFFD";

/**
 * Attempts to reverse "double-encoded UTF-8" mojibake: text that was UTF-8
 * bytes, mis-decoded as Latin-1/Windows-1252, then re-encoded as UTF-8.
 * Classic symptom: "Ã©" instead of "é", "â€™" instead of "’".
 * Only returns the repaired string if the round-trip is lossless and the
 * result contains no further corruption — otherwise returns the original
 * text unchanged so we never risk mangling something that wasn't corrupted.
 */
function tryFixDoubleEncoding(text: string): string {
  // Heuristic gate: only attempt repair when the text actually contains the
  // tell-tale high-byte Latin-1 sequences double-encoding produces.
  if (!/[\u00c2-\u00c5][\u0080-\u00bf]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from([...text].map((ch) => ch.charCodeAt(0)));
    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Only accept the repair if it didn't introduce new replacement chars
    // and it actually changed something (avoid no-op "fixes").
    if (repaired && !repaired.includes(REPLACEMENT_CHAR) && repaired !== text) {
      return repaired;
    }
  } catch {
    // Not valid UTF-8 once reinterpreted — leave the original text alone
    // rather than guessing.
  }
  return text;
}

/**
 * Normalizes a manager/team display name for safe rendering. Idempotent and
 * side-effect-free: call it at render time, never store the result as the
 * authoritative record.
 */
export function normalizeDisplayName(raw: string | null | undefined): string {
  if (!raw) return "";
  const repaired = tryFixDoubleEncoding(raw);
  if (!repaired.includes(REPLACEMENT_CHAR)) return repaired.trim();
  // Genuinely lost characters: don't fabricate — show a neutral marker so
  // the corruption is visible rather than silently hidden or guessed at.
  return repaired.replace(new RegExp(REPLACEMENT_CHAR, "g"), "\u2022").trim();
}
