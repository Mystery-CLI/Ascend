/** Minimal class-name joiner. No conflicting-class resolution needed here. */
export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

/** "3 cheers" / "1 cheer" and friends. */
export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || one + "s"}`;
}

/** Short relative time: "just now", "4m", "2h", "3d". */
export function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h`;
  return `${Math.round(secs / 86400)}d`;
}
