// The ranks of the realm.
//
// Renown thresholds MUST mirror the server's (base44/functions/realm/entry.ts).
// The server is the source of truth; these values are for showing a subject how
// far they have climbed and how far remains. Monarch is not reached by renown,
// it is the weekly crown, so it has no threshold.

export const RANKS = {
  peasant: { key: "peasant", label: "Peasant", threshold: 0, color: "rank-peasant", order: 0 },
  freeman: { key: "freeman", label: "Freeman", threshold: 50, color: "rank-freeman", order: 1 },
  knight: { key: "knight", label: "Knight", threshold: 500, color: "rank-knight", order: 2 },
  noble: { key: "noble", label: "Noble", threshold: 5000, color: "rank-noble", order: 3 },
  monarch: { key: "monarch", label: "Monarch", threshold: null, color: "rank-monarch", order: 4 },
};

// The climbing order (Monarch excluded, it is won, not earned by renown).
export const CLIMB = [RANKS.peasant, RANKS.freeman, RANKS.knight, RANKS.noble];

export function rankMeta(key) {
  return RANKS[key] || RANKS.peasant;
}

/** The next rank a subject is climbing toward, or null once they reach Noble. */
export function nextRank(currentKey) {
  const order = rankMeta(currentKey).order;
  if (order >= RANKS.noble.order) return null; // Noble or Monarch: nothing higher to earn
  return CLIMB[order + 1] || null;
}

/**
 * Progress toward the next rank, given a subject's own renown.
 * Returns { next, into, span, pct } or null when there is nothing left to climb.
 */
export function climbProgress(currentKey, renown) {
  const next = nextRank(currentKey);
  if (!next) return null;
  const floor = rankMeta(currentKey).threshold;
  const span = next.threshold - floor;
  const into = Math.max(0, Math.min(span, (renown ?? 0) - floor));
  return { next, into, span, pct: span > 0 ? (into / span) * 100 : 0 };
}

/** Order two rank keys, highest first. Used to sort the hierarchy. */
export function byRankDesc(a, b) {
  return rankMeta(b).order - rankMeta(a).order;
}
