import type { EnrichedPlayer, NewsAlert } from "../types";

/**
 * Injury/news signal, ported from x402-fpl-api-main's news.py. Net new — DGH
 * surfaced the raw `availability.news` string before, but never parsed it or
 * used it as a transfer/captain penalty signal (see PORT_NOTES.md).
 *
 * The `news` field is free text ("Hamstring - Expected back 15 Mar",
 * "Suspended for 3 matches"). This is a supplement to chance_of_playing,
 * which can lag the news text (a player may still show 75% while news says
 * "Unknown return date").
 */
const NEGATIVE_NEWS_KEYWORDS = [
  "unknown return",
  "expected back",
  "suspended",
  "international duty",
  "illness",
  "knock",
  "hamstring",
  "ankle",
  "knee",
  "thigh",
  "groin",
  "calf",
  "muscle",
  "ligament",
  "fracture",
  "concussion",
  "surgery",
  "operation",
  "personal reasons",
  "not in squad",
  "self-isolating",
  "match fitness",
];

export function formatNewsAge(newsAddedAt: string | null): string | null {
  if (!newsAddedAt) return null;
  const added = new Date(newsAddedAt);
  if (Number.isNaN(added.getTime())) return null;
  const now = Date.now();
  const deltaMs = now - added.getTime();
  const days = Math.floor(deltaMs / 86_400_000);
  const hours = Math.floor((deltaMs % 86_400_000) / 3_600_000);

  if (days <= 0) {
    if (hours <= 0) return "just now";
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 60) return "1 month ago";
  return `${Math.floor(days / 30)} months ago`;
}

export function hasNegativeNews(news: string): boolean {
  if (!news) return false;
  const lower = news.toLowerCase();
  return NEGATIVE_NEWS_KEYWORDS.some((kw) => lower.includes(kw));
}

/** -3.0 for "unknown return" (worst — no timeline), -2.0 for other negative
 * keywords, 0.0 if no concerning news. Meant as an additive penalty on top
 * of whatever availability penalty a scorer already applies. */
export function newsPenaltyScore(news: string): number {
  if (!news) return 0;
  const lower = news.toLowerCase();
  if (lower.includes("unknown return")) return -3;
  if (hasNegativeNews(news)) return -2;
  return 0;
}

export function formatNewsForReasoning(news: string, newsAddedAt: string | null): string | null {
  if (!news.trim()) return null;
  const age = formatNewsAge(newsAddedAt);
  return age ? `${news.trim()} (${age})` : news.trim();
}

/** Build news alerts for a set of players, tagging each with whose squad it's
 * in. Used for both "my squad" and rival squads. */
export function buildNewsAlerts(players: { player: EnrichedPlayer; ownerLabel: string; isMine: boolean }[]): NewsAlert[] {
  const alerts: NewsAlert[] = [];
  const seen = new Set<string>(); // playerId+owner, avoid dup if a player appears twice for the same owner
  for (const { player, ownerLabel, isMine } of players) {
    const news = player.availability.news;
    if (!news || !news.trim()) continue;
    const key = `${player.id}:${ownerLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    alerts.push({
      playerId: player.id,
      webName: player.webName,
      teamShort: player.teamShort,
      text: news.trim(),
      ageLabel: formatNewsAge(player.availability.newsAddedAt),
      severity: news.toLowerCase().includes("unknown return") || hasNegativeNews(news) ? "CONCERN" : "WATCH",
      isMine,
      ownerLabel,
    });
  }
  // Concerns first, then most recent
  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "CONCERN" ? -1 : 1;
    return 0;
  });
}
