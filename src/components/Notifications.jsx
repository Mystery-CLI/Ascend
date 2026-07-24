import { useEffect, useState } from "react";
import { Beer, MessageCircle, Star, Megaphone, Coins, Crown, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn, timeAgo } from "@/lib/utils";

const ICON = {
  cheer_tiding: Beer,
  cheer_reply: Beer,
  reply_tiding: MessageCircle,
  reply_reply: MessageCircle,
  champion: Star,
  proclaim: Megaphone,
  bounty: Coins,
  crowned: Crown,
};

const TONE = {
  cheer_tiding: "text-primary",
  cheer_reply: "text-primary",
  reply_tiding: "text-sky-400",
  reply_reply: "text-sky-400",
  champion: "text-primary",
  proclaim: "text-rank-noble",
  bounty: "text-rank-knight",
  crowned: "text-rank-monarch",
};

/**
 * X-style notifications: everything that has happened involving you, newest
 * first. Opening this page marks everything read in one batch (matching how
 * most apps clear the badge the moment you look at the list, not per-row).
 */
export function Notifications({ me, user, onOpenProfile }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.email) return;
    (async () => {
      const list = await base44.entities.Notification.list("-created_date", 60).catch(() => []);
      if (cancelled) return;
      setRows(list);
      setLoading(false);
      const unread = list.filter((n) => !n.read);
      if (unread.length) {
        Promise.all(
          unread.map((n) => base44.entities.Notification.update(n.id, { read: true }).catch(() => {}))
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  return (
    <div className="px-4 py-5">
      <h2 className="mb-4 text-center font-display text-2xl font-bold text-primary">Notifications</h2>

      <div className="overflow-hidden rounded-2xl border border-border bg-card/40">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !rows || rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nothing yet. The realm will let you know when something happens.
          </p>
        ) : (
          rows.map((n) => {
            const Icon = ICON[n.kind] || Beer;
            return (
              <button
                key={n.id}
                onClick={() => n.actor_subject_id && onOpenProfile?.(n.actor_subject_id)}
                disabled={!n.actor_subject_id}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border px-4 py-3.5 text-left transition last:border-b-0 hover:bg-foreground/[0.02]",
                  !n.read && "bg-primary/[0.04]"
                )}
              >
                <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", TONE[n.kind] || "text-primary")} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug text-foreground/95">{n.body}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n.created_date)}</p>
                </div>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
