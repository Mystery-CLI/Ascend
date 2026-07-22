import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { Crown, Loader2, ScrollText, Sparkles, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { realm } from "@/lib/realm";
import { RankBadge } from "@/components/RankBadge";
import { cn } from "@/lib/utils";

/**
 * The Throne Room: the state of the realm in one view. Who reigns and for how
 * much longer, the King's standing Decree that any subject may heed for renown,
 * the hierarchy from the throne down, and your own place in it.
 *
 * The Crown is disciplined here: opening this view calls the crown function,
 * which re-crowns whoever tops the week if the week has turned.
 */
export function ThroneRoom({ me, onStanding }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [decreeDraft, setDecreeDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [heeded, setHeeded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("crown", {});
      setState(res.data);
    } catch {
      /* throne unreachable; leave the loader */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    setHeeded(me?.heeded_day === new Date().toISOString().slice(0, 10));
  }, [load, me?.heeded_day]);

  const isMonarch = state?.monarch && me && state.monarch.subject_id === me.id;

  const heed = async () => {
    setBusy(true);
    try {
      const res = await realm("heed");
      setHeeded(true);
      onStanding?.(res);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const issueDecree = async (e) => {
    e.preventDefault();
    const text = decreeDraft.trim();
    if (!text) return;
    setBusy(true);
    try {
      await realm("decree", { text });
      setDecreeDraft("");
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const monarch = state?.monarch;
  const decree = state?.decree;

  return (
    <div className="px-4 py-5">
      <h2 className="mb-4 text-center font-display text-2xl font-bold text-primary">
        The Throne Room
      </h2>

      {/* The reigning Monarch */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-rank-monarch/40 bg-gradient-to-b from-rank-monarch/10 to-transparent p-6 text-center"
      >
        <img
          src="/art/crest-monarch.jpg"
          alt=""
          className="mx-auto mb-3 h-16 w-16 rounded-full object-cover ring-2 ring-rank-monarch/50"
        />
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Reigning Monarch</p>
        <p className="mt-1 font-display text-3xl font-bold text-rank-monarch">
          {monarch ? monarch.handle : "The throne stands empty"}
        </p>
        {monarch && <Countdown until={monarch.reign_ends_at} />}
      </motion.div>

      {/* The King's Decree */}
      <div className="mt-4 rounded-2xl border border-border bg-card/50 p-4">
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <ScrollText className="h-3.5 w-3.5 text-primary" /> The King&apos;s Decree
        </div>

        {isMonarch ? (
          <form onSubmit={issueDecree} className="space-y-2">
            <input
              value={decreeDraft}
              onChange={(e) => setDecreeDraft(e.target.value.slice(0, 140))}
              placeholder={decree?.text || "Decree a task for your realm..."}
              className="h-11 w-full rounded-xl border border-border bg-background/60 px-3 text-sm focus:border-primary/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !decreeDraft.trim()}
              className="h-10 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "…" : "Issue Decree"}
            </button>
          </form>
        ) : decree ? (
          <>
            <p className="text-[15px] italic text-foreground/90">&ldquo;{decree.text}&rdquo;</p>
            {me && (
              <button
                onClick={heed}
                disabled={busy || heeded}
                className={cn(
                  "mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                  heeded
                    ? "bg-secondary text-muted-foreground"
                    : "bg-primary text-primary-foreground hover:brightness-110"
                )}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : heeded ? (
                  "Decree heeded today"
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Heed the Decree · +10 renown
                  </>
                )}
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No Decree stands. The realm awaits its King&apos;s word.</p>
        )}
      </div>

      {/* Your standing */}
      {me && state?.my_position > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <ChevronUp className="h-4 w-4 text-primary" />
            <span className="text-sm">Your place in the realm</span>
          </div>
          <span className="tnum font-display text-lg font-bold text-primary">
            #{state.my_position}
            <span className="text-sm font-normal text-muted-foreground"> of {state.total_subjects}</span>
          </span>
        </div>
      )}

      {/* The hierarchy */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card/40">
        <div className="border-b border-border px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          The realm&apos;s standing
        </div>
        {state?.leaderboard?.map((row) => {
          const isMe = me && row.subject_id === me.id;
          return (
            <div
              key={row.subject_id}
              className={cn(
                "flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0",
                isMe && "bg-primary/[0.05]"
              )}
            >
              <span
                className={cn(
                  "tnum w-6 shrink-0 text-center font-display font-bold",
                  row.position === 1 ? "text-rank-monarch" : "text-muted-foreground"
                )}
              >
                {row.position}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {row.handle}
                {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
              </span>
              <RankBadge rank={row.rank} size="xs" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Countdown({ until }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return <p className="mt-1 text-xs text-muted-foreground">the reign is ending…</p>;
  const days = Math.floor(ms / 86400000);
  const hrs = Math.floor((ms % 86400000) / 3600000);
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      reigns for {days > 0 ? `${days}d ` : ""}
      {hrs}h more
    </p>
  );
}
