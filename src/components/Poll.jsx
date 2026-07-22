import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * An X-style poll. Before you vote it shows tappable options; after you vote (or
 * once it closes) it shows result bars with percentages, your choice ticked, and
 * the total plus time remaining. Individual votes stay private; only the tally,
 * which lives on the tiding, is public.
 */
export function Poll({ tiding, myVoteIndex, onVote, disabled }) {
  const options = tiding.poll_options || [];
  const votes = tiding.poll_votes || options.map(() => 0);
  const total = votes.reduce((a, b) => a + (b || 0), 0);
  const closed = tiding.poll_closes_at && Date.now() > new Date(tiding.poll_closes_at).getTime();
  const voted = myVoteIndex !== undefined && myVoteIndex !== null;
  const showResults = voted || closed;
  const leading = votes.indexOf(Math.max(...votes));

  return (
    <div className="mt-2 space-y-1.5">
      {options.map((opt, i) => {
        const count = votes[i] || 0;
        const pct = total ? Math.round((count / total) * 100) : 0;

        if (showResults) {
          const mine = i === myVoteIndex;
          return (
            <div
              key={i}
              className="relative overflow-hidden rounded-lg border border-border"
            >
              <div
                className={cn(
                  "absolute inset-y-0 left-0 transition-all",
                  i === leading ? "bg-primary/20" : "bg-secondary"
                )}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
              <div className="relative flex items-center justify-between px-3 py-2 text-sm">
                <span className={cn("flex min-w-0 items-center gap-1.5", mine && "font-semibold")}>
                  {mine && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  <span className="truncate">{opt}</span>
                </span>
                <span className="tnum shrink-0 pl-2 text-muted-foreground">{pct}%</span>
              </div>
            </div>
          );
        }

        return (
          <button
            key={i}
            onClick={() => onVote(tiding.id, i)}
            disabled={disabled}
            className="w-full truncate rounded-full border border-primary/50 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/10 disabled:opacity-50"
          >
            {opt}
          </button>
        );
      })}

      <p className="pt-0.5 text-xs text-muted-foreground">
        {total} {total === 1 ? "vote" : "votes"} · {closed ? "Final result" : timeLeft(tiding.poll_closes_at)}
      </p>
    </div>
  );
}

function timeLeft(iso) {
  if (!iso) return "open";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "closing";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h left`;
  return `${Math.round(hrs / 24)}d left`;
}
