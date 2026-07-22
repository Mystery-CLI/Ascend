import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, Loader2, Megaphone, Star, Coins, X } from "lucide-react";
import { RankBadge } from "@/components/RankBadge";
import { MediaGrid } from "@/components/MediaGrid";
import { Poll } from "@/components/Poll";
import { base44 } from "@/api/base44Client";
import { rankMeta } from "@/lib/ranks";
import { cn, timeAgo } from "@/lib/utils";

const EMPTY_SET = new Set();

// Plain-language explanations shown before Champion, Proclaim, or Bounty
// fires, since all three are once-a-day and act on someone beyond just you.
const POWER_INFO = {
  champion: {
    icon: Star,
    tone: "text-primary",
    confirmBg: "bg-primary",
    title: "Champion this tiding?",
    body: () => "It gets lifted to the top of the Tavern for 6 hours, so the whole realm sees it first. You can only Champion once a day.",
    confirmLabel: "Champion it",
  },
  proclaim: {
    icon: Megaphone,
    tone: "text-rank-noble",
    confirmBg: "bg-rank-noble",
    title: "Proclaim this tiding?",
    body: () => "It gets pinned above every other tiding in the Tavern, kingdom-wide, until you (or another Noble) proclaim again. You can only Proclaim once a day.",
    confirmLabel: "Proclaim it",
  },
  bounty: {
    icon: Coins,
    tone: "text-rank-knight",
    confirmBg: "bg-rank-knight",
    title: "Grant a Bounty?",
    body: (handle) =>
      `${handle || "This commoner"} gets a random 15–40 renown, straight from you, no questions asked. You can only grant one Bounty a day.`,
    confirmLabel: "Grant it",
  },
};

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
  myReplyCheers = EMPTY_SET,
  onCheerReply,
}) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState(null);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [powerBusy, setPowerBusy] = useState(false);
  const [confirming, setConfirming] = useState(null); // "champion" | "proclaim" | null
  const [replyingTo, setReplyingTo] = useState(null); // { id, handle } | null, for nested replies
  const composerRef = useRef(null);

  // Group the flat reply list into a tree, X-style: a reply can itself be
  // replied to, so this is keyed by parent_reply_id (null for a reply that
  // answers the tiding directly).
  const byParent = useMemo(() => {
    const map = new Map();
    for (const r of replies || []) {
      const key = r.parent_reply_id || null;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return map;
  }, [replies]);
  const rootReplies = byParent.get(null) || [];

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
      const newReply = await onReply(tiding.id, body, replyingTo?.id);
      setDraft("");
      setReplyingTo(null);
      if (newReply) setReplies((prev) => [...(prev || []), newReply]);
      if (!open) setOpen(true);
    } catch {
      /* gate opened or realm refused; keep the draft */
    } finally {
      setSending(false);
    }
  };

  const startReplyTo = (r) => {
    setReplyingTo({ id: r.id, handle: r.author_handle });
    if (!open) setOpen(true);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  // Cheering a reply: the "have I cheered" Set lives in App (so it can be
  // fetched once for the whole feed), but the reply's own count only lives
  // here, in this card's local replies list.
  const cheerReply = async (replyId) => {
    const had = myReplyCheers.has(replyId);
    setReplies((prev) =>
      (prev || []).map((r) =>
        r.id === replyId ? { ...r, cheers_count: Math.max(0, (r.cheers_count || 0) + (had ? -1 : 1)) } : r
      )
    );
    try {
      await onCheerReply?.(replyId);
    } catch {
      setReplies((prev) =>
        (prev || []).map((r) =>
          r.id === replyId ? { ...r, cheers_count: Math.max(0, (r.cheers_count || 0) + (had ? 1 : -1)) } : r
        )
      );
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
                iconSize="h-5 w-5"
              />
            </div>
            <div className="ml-auto flex items-center gap-0.5">
              {powerBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {canChampion && (
                <PowerButton
                  icon={Star}
                  label="Champion"
                  tone="text-primary hover:bg-primary/10"
                  onClick={() => setConfirming("champion")}
                  disabled={powerBusy}
                />
              )}
              {canProclaim && (
                <PowerButton
                  icon={Megaphone}
                  label="Proclaim"
                  tone="text-rank-noble hover:bg-rank-noble/10"
                  onClick={() => setConfirming("proclaim")}
                  disabled={powerBusy}
                />
              )}
              {canBounty && (
                <PowerButton
                  icon={Coins}
                  label="Bounty"
                  tone="text-rank-knight hover:bg-rank-knight/10"
                  onClick={() => setConfirming("bounty")}
                  disabled={powerBusy}
                />
              )}
            </div>
          </div>

          {/* A plain-language confirm before wielding Champion, Proclaim, or
              Bounty: all three act on someone beyond just you and are
              once-a-day, so a tap should not fire them by accident. */}
          <AnimatePresence>
            {confirming && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setConfirming(null);
                }}
              >
                <motion.div
                  initial={{ scale: 0.92, y: 12 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.92, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 22 }}
                  className="w-full max-w-xs rounded-3xl border border-border bg-card p-6 text-center"
                >
                  {(() => {
                    const info = POWER_INFO[confirming];
                    const Icon = info.icon;
                    return (
                      <>
                        <Icon className={cn("mx-auto mb-3 h-8 w-8", info.tone)} />
                        <p className="font-display text-lg font-bold text-foreground">{info.title}</p>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{info.body(handle)}</p>
                        <div className="mt-5 flex gap-2">
                          <button
                            onClick={() => setConfirming(null)}
                            className="h-10 flex-1 rounded-xl bg-secondary text-sm font-medium text-foreground transition hover:brightness-110"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              const which = confirming;
                              setConfirming(null);
                              wield(() => {
                                if (which === "champion") return onChampion(tiding.id);
                                if (which === "proclaim") return onProclaim(tiding.id);
                                return onBounty(author.id);
                              });
                            }}
                            className={cn(
                              "h-10 flex-1 rounded-xl text-sm font-semibold text-primary-foreground transition hover:brightness-110",
                              info.confirmBg
                            )}
                          >
                            {info.confirmLabel}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

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
                    rootReplies.map((r) => (
                      <ReplyRow
                        key={r.id}
                        reply={r}
                        byParent={byParent}
                        myReplyCheers={myReplyCheers}
                        onCheerReply={cheerReply}
                        onReplyTo={startReplyTo}
                        onMessageSubject={onMessageSubject}
                        busy={busy}
                      />
                    ))
                  )}

                  <form onSubmit={submitReply} className="space-y-1.5 pt-0.5">
                    {replyingTo && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        Replying to <span className="font-medium text-foreground/80">@{replyingTo.handle}</span>
                        <button
                          type="button"
                          onClick={() => setReplyingTo(null)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        ref={composerRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={replyingTo ? `Reply to @${replyingTo.handle}...` : "Reply to this tiding..."}
                        className="h-9 min-w-0 flex-1 rounded-full border border-border bg-background/40 px-3.5 text-sm focus:border-primary/60 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={sending || !draft.trim()}
                        className="flex h-9 shrink-0 items-center rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reply"}
                      </button>
                    </div>
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
function Action({
  icon: Icon,
  count,
  onClick,
  disabled,
  hoverColor,
  active,
  activeColor,
  fill,
  label,
  iconSize = "h-[18px] w-[18px]",
}) {
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
        <Icon className={cn(iconSize, fill && "fill-current")} />
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
        "flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider transition disabled:opacity-40",
        tone
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * One reply row, X-style: cheerable and repliable just like a tiding, and
 * recursive, so an answer to this reply nests one level further in, with its
 * own thread line, rather than only ever answering the top-level tiding.
 */
function ReplyRow({ reply, byParent, myReplyCheers, onCheerReply, onReplyTo, onMessageSubject, busy }) {
  const cheered = myReplyCheers.has(reply.id);
  const kids = byParent.get(reply.id) || [];

  return (
    <div>
      <div className="flex gap-2">
        <button
          onClick={() => onMessageSubject?.(reply.author_subject_id)}
          className="h-8 shrink-0"
          title={`Send ${reply.author_handle} a raven`}
        >
          <Avatar url={null} handle={reply.author_handle} small />
        </button>
        <div className="min-w-0 flex-1">
          <button
            onClick={() => onMessageSubject?.(reply.author_subject_id)}
            className="max-w-full truncate text-[13px] font-semibold hover:underline"
          >
            {reply.author_handle}
          </button>
          <p className="break-words text-sm leading-snug text-foreground/80">{reply.body}</p>
          <div className="mt-1 flex items-center gap-5">
            <button
              onClick={() => onReplyTo(reply)}
              title="Reply"
              className="flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-sky-400"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Reply
            </button>
            <button
              onClick={() => onCheerReply(reply.id)}
              disabled={busy}
              title="Cheer"
              className={cn(
                "flex items-center gap-1 text-[11px] transition",
                cheered ? "text-primary" : "text-muted-foreground hover:text-primary"
              )}
            >
              <Tankard className={cn("h-3.5 w-3.5", cheered && "fill-current")} />
              {reply.cheers_count > 0 && <span className="tnum">{reply.cheers_count}</span>}
            </button>
          </div>
        </div>
      </div>

      {kids.length > 0 && (
        <div className="mt-2 ml-2 space-y-2 border-l-2 border-border pl-3">
          {kids.map((kid) => (
            <ReplyRow
              key={kid.id}
              reply={kid}
              byParent={byParent}
              myReplyCheers={myReplyCheers}
              onCheerReply={onCheerReply}
              onReplyTo={onReplyTo}
              onMessageSubject={onMessageSubject}
              busy={busy}
            />
          ))}
        </div>
      )}
    </div>
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
