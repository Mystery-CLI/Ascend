/** Minimal class-name joiner. No conflicting-class resolution needed here. */
export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

/** "3 cheers" / "1 cheer" and friends. */
export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || one + "s"}`;
}

/** Uploads (avatars, tiding media) spend from Base44's monthly integration
 * credit pool, the same one AI calls draw from. Once it is exhausted every
 * upload fails with a 402, which reads as a random bug unless named. */
export function uploadErrorMessage(err) {
  if (err?.status === 402 && err?.data?.extra_data?.reason === "integration_credits_limit_reached") {
    return "Uploads are paused: the realm's monthly credits are used up. Try again once they renew.";
  }
  return err?.message || "That upload failed. Try again.";
}

/** Short relative time: "just now", "4m", "2h", "3d". */
export function timeAgo(iso) {
  if (!iso) return "";
  // Base44's own auto-managed created_date comes back with no timezone
  // suffix ("2026-07-22T11:33:06.631000"), a naive string that is really
  // UTC. Without this, the browser parses it as LOCAL time, and every
  // "just now" reads as however far the viewer's clock sits from UTC (an
  // hour, for a UTC+1 viewer, right when a tiding is first posted).
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(iso);
  const then = new Date(hasZone ? iso : `${iso}Z`).getTime();
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h`;
  return `${Math.round(secs / 86400)}d`;
}
