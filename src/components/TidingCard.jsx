import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, Loader2, Megaphone, Star, Coins } from "lucide-react";
import { RankBadge } from "@/components/RankBadge";
import { MediaGrid } from "@/components/MediaGrid";
import { Poll } from "@/components/Poll";
import { base44 } from "@/api/base44Client";
import { rankMeta } from "@/lib/ranks";
import { cn, timeAgo } from "@/lib/utils";

/**
 * One tiding, laid out the way X lays out a post: an avatar in the left gutter,
 * a single content column with an inline header, the body, then a spread
 * engagement bar whose actions light up on hover. Rows are divided by hairlines
 * rather than floated as separate cards, which is what reads as "feed" rather
 * than "list of boxes".
 *
 * The author's badge shows their LIVE rank, so a peasant's old tiding wears
 * their crown the day they earn it. Cheering, replying, and the rank powers all
 * call the realm engine, which is the only thing that can move renown.
 */
export function TidingCard({
  tiding,
  author,
  cheered,
  onCheer,
  onReply,
  myRank,
  onChampion,
  onProclaim,
  onBounty,
  myVoteIndex,
  onVote,
  onMessageSubject,
  busy,
}) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState(null);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [powerBusy, setPowerBusy] = useState(false);

  const rank = author?.rank || "peasant";
  const handle = author?.handle || tiding.author_handle || "Unknown";
  const championed =
    tiding.championed_until && new Date(tiding.championed_until).getTime() > Date.now();

  const myOrder = myRank ? rankMeta(myRank).order : -1;
  const canChampion = myOrder >= rankMeta("knight").order && !championed;
  const canProclaim = myOrder >= rankMeta("noble").order && !tiding.proclaimed;
  const canBounty = myOrder >= rankMeta("noble").order && rank === "peasant" && !!author?.id;
  const hasPowers = canChampion || canProclaim || canBounty;

  const wield = async (fn) => {
    setPowerBusy(true);
    try {
      await fn();
    } finally {
      setPowerBusy(false);
    }
  };

  const toggleReplies = async () => {
    const next = !open;
    setOpen(next);
    if (next && replies === null) {
      setLoadingReplies(true);
      try {
        const rows = await base44.entities.Reply.filter({ tiding_id: tiding.id }, "created_date");
        setReplies(rows);
      } catch {
        setReplies([]);
      } finally {
        setLoadingReplies(false);
      }
    }
  };

  const submitReply = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await onReply(tiding.id, body);
      setDraft("");
      const rows = await base44.entities.Reply.filter({ tiding_id: tiding.id }, "created_date");
      setReplies(rows);
      if (!open) setOpen(true);
    } catch {
      /* gate opened or realm refused; keep the draft */
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "border-b border-border px-4 py-3 transition-colors hover:bg-foreground/[0.015]",
        tiding.proclaimed && "bg-rank-noble/[0.04]"
      )}
    >
      {(tiding.proclaimed || championed) && (
        <div
          className={cn(
            "mb-1.5 flex items-center gap-1.5 pl-[52px] text-[11px] font-medium uppercase tracking-wider",
            tiding.proclaimed ? "text-rank-noble" : "text-primary"
          )}
        >
          {tiding.proclaimed ? (
            <>
              <Megaphone className="h-3 w-3" /> Proclaimed to the realm
            </>
          ) : (
            <>
              <Star className="h-3 w-3" /> Championed
            </>
          )}
        </div>
      )}

      <div className="flex gap-2.5">
        <button
          onClick={() => onMessageSubject?.(tiding.author_subject_id)}
          className="h-10 shrink-0"
          title={`Send ${handle} a raven`}
        >
          <Avatar url={author?.avatar_url} handle={handle} />
        </button>

        <div className="min-w-0 flex-1">
          {/* Inline header, X-style: name, rank, dot, time */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <button
              onClick={() => onMessageSubject?.(tiding.author_subject_id)}
              className="max-w-full truncate text-[15px] font-semibold leading-tight hover:underline"
            >
              {handle}
            </button>
            <RankBadge rank={rank} size="xs" />
            <span className="text-sm text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">{timeAgo(tiding.created_date)}</span>
          </div>

          {tiding.body && (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-normal text-foreground/95">
              {tiding.body}
            </p>
          )}

          <MediaGrid media={tiding.media} kind={tiding.media_kind} poster={tiding.media_poster} />

          {tiding.poll_options?.length >= 2 && (
            <Poll tiding={tiding} myVoteIndex={myVoteIndex} onVote={onVote} disabled={busy} />
          )}

          {/* Engagement bar: actions grouped left, powers to the right */}
          <div className="mt-2 flex items-center">
            <div className="flex items-center gap-8">
              <Action
                icon={MessageCircle}
                count={tiding.replies_count || 0}
                onClick={toggleReplies}
                hoverColor="group-hover:bg-sky-500/10 group-hover:text-sky-400"
                active={open}
                activeColor="text-sky-400"
                label="Reply"
              />
              <Action
                icon={Tankard}
                count={tiding.cheers_count || 0}
                onClick={() => onCheer(tiding.id)}
                disabled={busy}
                hoverColor="group-hover:bg-primary/10 group-hover:text-primary"
                active={cheered}
                activeColor="text-primary"
                fill={cheered}
                label="Cheer"
              />
            </div>
            <div className="ml-auto flex items-center gap-0.5">
              {powerBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {canChampion && (
                <PowerButton
                  icon={Star}
                  label="Champion"
                  tone="text-primary hover:bg-primary/10"
                  onClick={() => wield(() => onChampion(tiding.id))}
                  disabled={powerBusy}
                />
              )}
              {canProclaim && (
                <PowerButton
                  icon={Megaphone}
                  label="Proclaim"
                  tone="text-rank-noble hover:bg-rank-noble/10"
                  onClick={() => wield(() => onProclaim(tiding.id))}
                  disabled={powerBusy}
                />
              )}
              {canBounty && (
                <PowerButton
                  icon={Coins}
                  label="Bounty"
                  tone="text-rank-knight hover:bg-rank-knight/10"
                  onClick={() => wield(() => onBounty(author.id))}
                  disabled={powerBusy}
                />
              )}
            </div>
          </div>

          {/* Replies */}
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                {/* Replies nest INSIDE the tiding, X-style: indented past the
                    author's avatar with a thread line, so they read as answers
                    to this post rather than posts of their own. */}
                <div className="mt-2 ml-2 space-y-3 border-l-2 border-border pl-4 pt-1">
                  {loadingReplies ? (
                    <div className="flex justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    (replies || []).map((r) => (
                      <div key={r.id} className="flex gap-2">
                        <button
                          onClick={() => onMessageSubject?.(r.author_subject_id)}
                          className="h-8 shrink-0"
                          title={`Send ${r.author_handle} a raven`}
                        >
                          <Avatar url={null} handle={r.author_handle} small />
                        </button>
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => onMessageSubject?.(r.author_subject_id)}
                            className="max-w-full truncate text-[13px] font-semibold hover:underline"
                          >
                            {r.author_handle}
                          </button>
                          <p className="break-words text-sm leading-snug text-foreground/80">
                            {r.body}
                          </p>
                        </div>
                      </div>
                    ))
                  )}

                  <form onSubmit={submitReply} className="flex items-center gap-2 pt-0.5">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Reply to this tiding..."
                      className="h-9 min-w-0 flex-1 rounded-full border border-border bg-background/40 px-3.5 text-sm focus:border-primary/60 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      className="flex h-9 shrink-0 items-center rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reply"}
                    </button>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.article>
  );
}

/** An X-style engagement action: icon in a circular hover pad, count beside it. */
function Action({ icon: Icon, count, onClick, disabled, hoverColor, active, activeColor, fill, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "group flex items-center gap-1 text-[13px] transition-colors",
        active ? activeColor : "text-muted-foreground"
      )}
    >
      <span className={cn("-m-1.5 rounded-full p-1.5 transition-colors", hoverColor)}>
        <Icon className={cn("h-[18px] w-[18px]", fill && "fill-current")} />
      </span>
      {count > 0 && <span className="tnum">{count}</span>}
    </button>
  );
}

/**
 * A clean tankard, just the mug and its handle. The lucide beer glyph carries
 * two froth lines across the top that read as a trash-can lid at small sizes,
 * which is the last thing a "cheer" button should suggest. When cheered, the
 * Action adds `fill-current` and the mug fills with gold.
 */
function Tankard({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 6 H15 V16 a2 2 0 0 1 -2 2 H9 a2 2 0 0 1 -2 -2 Z" />
      <path d="M15 9 h2 a2 2 0 0 1 2 2 v1 a2 2 0 0 1 -2 2 h-2" />
    </svg>
  );
}

function PowerButton({ icon: Icon, label, tone, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-wider transition disabled:opacity-40",
        tone
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Avatar({ url, handle, small }) {
  const initial = (handle || "?").charAt(0).toUpperCase();
  const size = small ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  if (url) {
    return <img src={url} alt={handle} className={cn("shrink-0 rounded-full object-cover", size)} />;
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-secondary font-display font-semibold text-primary",
        size
      )}
    >
      {initial}
    </div>
  );
}
