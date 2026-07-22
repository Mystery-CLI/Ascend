// The laws of standing, shared by every function that can change it.
//
// Both the realm engine (player actions) and the citizens (the AI populace)
// award renown and re-derive rank, so the numbers and the thresholds live here,
// in one place, rather than drifting between two copies.

export const RENOWN = {
  post: 2, // author, for posting a tiding
  cheerReceived: 5, // author, when someone cheers their tiding
  cheerGiven: 1, // the cheerer, for taking part
  replyReceived: 4, // author, when someone replies to their tiding
  replyGiven: 1, // the replier, for taking part
  voteReceived: 2, // poll author, when someone votes on their poll
  voteGiven: 1, // the voter, for taking part
  bountyMin: 15, // smallest bounty a Noble may grant
  bountyMax: 40, // largest
};

// Rank thresholds by renown. Monarch is NOT reached this way, it is the weekly
// crown, so the climb by renown tops out at Noble.
export const THRESHOLDS = [
  { rank: "noble", at: 600 },
  { rank: "knight", at: 200 },
  { rank: "freeman", at: 50 },
  { rank: "peasant", at: 0 },
];

// Ascending order, for comparing who outranks whom. Monarch sits above all.
export const RANK_ORDER = ["peasant", "freeman", "knight", "noble", "monarch"];

export function rankOrder(rank: string): number {
  const i = RANK_ORDER.indexOf(rank);
  return i === -1 ? 0 : i;
}

export function rankForRenown(renown: number): string {
  for (const t of THRESHOLDS) {
    if (renown >= t.at) return t.rank;
  }
  return "peasant";
}

// A rolling seven-day bucket, so the Crown resets weekly. The exact boundary is
// arbitrary; what matters is that a new week starts every seven days.
export function weekKey(): number {
  return Math.floor(Date.now() / (7 * 86400000));
}

// A subject's renown earned THIS week, which the Crown is decided by. Renown from
// a previous week does not count, so no one can sit on the throne forever.
export function effectiveWeekRenown(s: any): number {
  return s.week_key === weekKey() ? s.week_renown || 0 : 0;
}

// A believable renown for a citizen seeded at a given rank: a little above the
// floor, so their standing reads as earned rather than exactly on the line.
export function seedRenownForRank(rank: string): number {
  switch (rank) {
    case "noble":
      return 620 + Math.floor(Math.random() * 200);
    case "knight":
      return 230 + Math.floor(Math.random() * 140);
    case "freeman":
      return 70 + Math.floor(Math.random() * 90);
    default:
      return 5 + Math.floor(Math.random() * 30);
  }
}

/**
 * Grant (or dock) renown on a subject and re-derive rank. The Monarch's crown is
 * never removed by a renown change; only the weekly crowning touches that rank.
 * `svc` is a service-role client.
 */
export async function adjustRenown(svc: any, subjectId: string, delta: number) {
  const s = await svc.entities.Subject.get(subjectId);
  if (!s) return null;
  const renown = Math.max(0, (s.renown || 0) + delta);
  const patch: Record<string, unknown> = { renown };
  if (s.rank !== "monarch") patch.rank = rankForRenown(renown);
  // Only gains count toward the weekly race for the Crown, and they reset when
  // the week turns over.
  if (delta > 0) {
    const wk = weekKey();
    patch.week_renown = s.week_key === wk ? (s.week_renown || 0) + delta : delta;
    patch.week_key = wk;
  }
  await svc.entities.Subject.update(subjectId, patch);
  return { ...s, ...patch };
}

export async function findSubjectByEmail(svc: any, email: string) {
  const rows = await svc.entities.Subject.filter({ user_email: email });
  return rows[0] || null;
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
