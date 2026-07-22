import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, Loader2, Megaphone, Star, Coins, ArrowLeft, ChevronRight } from "lucide-react";
import { RankBadge } from "@/components/RankBadge";
import { MediaGrid } from "@/components/MediaGrid";
import { Poll } from "@/components/Poll";
import { base44 } from "@/api/base44Client";
import { rankMeta } from "@/lib/ranks";
import { cn, timeAgo } from "@/lib/utils";
import { notify } from "@/lib/toast";
import { useVisualViewport } from "@/lib/useVisualViewport";

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
  onOpenProfile,
  busy,
  myReplyCheers = EMPTY_SET,
  onCheerReply,
}) {
  // X-style navigation: tapping the tiding's body opens its own full page (the
  // tiding plus its top-level replies); tapping into a reply from there pushes
  // a focused id onto replyStack (deeper taps push further, back pops). The
  // comment ICON never shows this at all, it only opens a bare compose box, per
  // the "icon composes, body views" split X actually uses.
  const [viewingTiding, setViewingTiding] = useState(false);
  const [replyStack, setReplyStack] = useState([]);
  const [quickCompose, setQuickCompose] = useState(false);
  const [replies, setReplies] = useState(null);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [powerBusy, setPowerBusy] = useState(false);
  const [confirming, setConfirming] = useState(null); // "champion" | "proclaim" | null

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

  const ensureRepliesLoaded = async () => {
    if (replies !== null) return;
    setLoadingReplies(true);
    try {
      const rows = await base44.entities.Reply.filter({ tiding_id: tiding.id }, "created_date");
      setReplies(rows);
    } catch {
      setReplies([]);
    } finally {
      setLoadingReplies(false);
    }
  };

  // Tapping the body: the tiding's own page, full content plus its top-level
  // replies. The only place existing comments are ever shown.
  const openTidingView = async () => {
    await ensureRepliesLoaded();
    setReplyStack([]);
    setViewingTiding(true);
  };

  const pushReply = (replyId) => setReplyStack((prev) => [...prev, replyId]);
  const backOneLevel = () =>
    setReplyStack((prev) => {
      if (prev.length > 0) return prev.slice(0, -1);
      setViewingTiding(false); // already at the tiding's own page: back closes it
      return prev;
    });
  const focusReplyId = replyStack[replyStack.length - 1] || null;

  const submitTidingReply = async (body) => {
    const newReply = await onReply(tiding.id, body, null);
    if (newReply) setReplies((prev) => [...(prev || []), newReply]);
  };

  // Tapping the comment ICON: compose only, never a view of what is already
  // there. Closes itself on send, same as X dismisses a quick reply from feed.
  const submitQuickCompose = async (body) => {
    const newReply = await onReply(tiding.id, body, null);
    if (newReply) setReplies((prev) => (prev === null ? prev : [...prev, newReply]));
    setQuickCompose(false);
    notify("Reply sent.", "success");
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
          onClick={() => onOpenProfile?.(tiding.author_subject_id)}
          className="h-10 shrink-0"
          title={`View ${handle}'s crest`}
        >
          <Avatar url={author?.avatar_url} handle={handle} />
        </button>

        <div className="min-w-0 flex-1">
          {/* Only the "top part" (header + body text) opens the tiding's page.
              Media gets its own zone below: a video has its own controls, and
              tapping play/scrub should never also navigate away underneath it. */}
          <div onClick={openTidingView} className="cursor-pointer">
            {/* Inline header, X-style: name, rank, dot, time */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenProfile?.(tiding.author_subject_id);
                }}
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
          </div>

          <div onClick={(e) => e.stopPropagation()}>
            <MediaGrid media={tiding.media} kind={tiding.media_kind} poster={tiding.media_poster} />
          </div>

          {tiding.poll_options?.length >= 2 && (
            <div onClick={(e) => e.stopPropagation()}>
              <Poll tiding={tiding} myVoteIndex={myVoteIndex} onVote={onVote} disabled={busy} />
            </div>
          )}

          {/* Engagement bar: actions grouped left, powers to the right. Its own
              click zone, so cheering/replying/powers never also opens the
              tiding's page underneath them. */}
          <div onClick={(e) => e.stopPropagation()} className="mt-2 flex items-center">
            <div className="flex items-center gap-8">
              <Action
                icon={MessageCircle}
                count={tiding.replies_count || 0}
                onClick={() => setQuickCompose(true)}
                hoverColor="group-hover:bg-sky-500/10 group-hover:text-sky-400"
                active={quickCompose}
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

        </div>
      </div>

      {/* Everything below is rendered OUTSIDE the clickable content column on
          purpose: each of these is a full-screen overlay, and if it were a
          descendant of that column, taps inside it (typing a reply, tapping a
          menu) would bubble up and re-trigger openTidingView underneath it.
          Sibling position means that can never happen, no stopPropagation
          bookkeeping required. */}

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
              exit={{ scale: 0.92 }}
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

      {/* The tiding's own page: its full content plus its top-level replies.
          The ONLY place any existing comments are ever shown. Opened by
          tapping anywhere in the clickable column above, body text or not:
          a media-only or poll-only tiding has no body paragraph to tap, so
          the click lives on the whole column as a fallback that always works. */}
      <AnimatePresence>
        {viewingTiding && !focusReplyId && (
          <TidingThread
            tiding={tiding}
            author={author}
            handle={handle}
            rank={rank}
            cheered={cheered}
            onCheer={onCheer}
            rootReplies={rootReplies}
            byParent={byParent}
            loadingReplies={loadingReplies}
            myReplyCheers={myReplyCheers}
            onCheerReply={cheerReply}
            onOpenThread={pushReply}
            onBack={backOneLevel}
            onOpenProfile={onOpenProfile}
            onSubmitReply={submitTidingReply}
            busy={busy}
          />
        )}
      </AnimatePresence>

      {/* The focused thread: X-style, a reply's own replies are hidden
          until you tap in. Reuses the same `replies`/`byParent` already
          fetched for this tiding, so nothing new is queried to open it. */}
      <AnimatePresence>
        {focusReplyId && (
          <ReplyThread
            tiding={tiding}
            tidingAuthor={{ handle, rank, avatar_url: author?.avatar_url }}
            focusId={focusReplyId}
            depth={replyStack.length}
            replies={replies || []}
            byParent={byParent}
            myReplyCheers={myReplyCheers}
            onCheerReply={cheerReply}
            onOpenThread={pushReply}
            onBack={backOneLevel}
            onOpenProfile={onOpenProfile}
            onSubmitReply={async (body) => {
              const newReply = await onReply(tiding.id, body, focusReplyId);
              if (newReply) setReplies((prev) => [...(prev || []), newReply]);
            }}
            busy={busy}
          />
        )}
      </AnimatePresence>

      {/* The comment icon: compose only, never a view. Tiding shown
          compact for context, one field, one button, nothing else. */}
      <AnimatePresence>
        {quickCompose && (
          <QuickCompose
            tiding={tiding}
            tidingAuthor={{ handle, rank, avatar_url: author?.avatar_url }}
            onClose={() => setQuickCompose(false)}
            onSubmit={submitQuickCompose}
          />
        )}
      </AnimatePresence>
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
 * One reply row, X-style: cheerable, and its OWN replies stay hidden until
 * someone taps in. Tapping the body, the "Reply" quick action, or the "N
 * replies" line all do the same thing: open the focused thread for this
 * reply, where its children and a composer targeting it both live.
 */
function ReplyRow({ reply, childCount = 0, myReplyCheers, onCheerReply, onOpenThread, onOpenProfile, busy }) {
  const cheered = myReplyCheers.has(reply.id);

  return (
    <div className="flex gap-2">
      <button
        onClick={() => onOpenProfile?.(reply.author_subject_id)}
        className="h-8 shrink-0"
        title={`View ${reply.author_handle}'s crest`}
      >
        <Avatar url={null} handle={reply.author_handle} small />
      </button>
      <div className="min-w-0 flex-1">
        <button
          onClick={() => onOpenProfile?.(reply.author_subject_id)}
          className="max-w-full truncate text-[13px] font-semibold hover:underline"
        >
          {reply.author_handle}
        </button>
        <p
          onClick={() => onOpenThread(reply.id)}
          className="cursor-pointer break-words text-sm leading-snug text-foreground/80"
        >
          {reply.body}
        </p>
        <div className="mt-1 flex items-center gap-5">
          <button
            onClick={() => onOpenThread(reply.id)}
            title="Reply"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-sky-400"
          >
            <MessageCircle className="h-4 w-4" />
            Reply
          </button>
          <button
            onClick={() => onCheerReply(reply.id)}
            disabled={busy}
            title="Cheer"
            className={cn(
              "flex items-center gap-1.5 text-xs transition",
              cheered ? "text-primary" : "text-muted-foreground hover:text-primary"
            )}
          >
            <Tankard className={cn("h-4 w-4", cheered && "fill-current")} />
            {reply.cheers_count > 0 && <span className="tnum">{reply.cheers_count}</span>}
          </button>
        </div>

        {childCount > 0 && (
          <button
            onClick={() => onOpenThread(reply.id)}
            className="mt-1.5 flex items-center gap-0.5 text-[11px] font-medium text-sky-400 hover:underline"
          >
            {childCount} {childCount === 1 ? "reply" : "replies"}
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The focused thread, X-style: opened by tapping a reply, this shows that
 * reply as the main content with the original tiding collapsed above it for
 * context, and only ITS direct children below, still collapsed themselves
 * until tapped. Tapping a child pushes the stack one level deeper; back pops.
 */
function ReplyThread({
  tiding,
  tidingAuthor,
  focusId,
  depth,
  replies,
  byParent,
  myReplyCheers,
  onCheerReply,
  onOpenThread,
  onBack,
  onOpenProfile,
  onSubmitReply,
  busy,
}) {
  const focus = replies.find((r) => r.id === focusId);
  const children = byParent.get(focusId) || [];
  const cheered = focus ? myReplyCheers.has(focus.id) : false;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const { height, offsetTop } = useVisualViewport();

  const submit = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSubmitReply(body);
      setDraft("");
    } catch {
      /* gate opened or realm refused; keep the draft */
    } finally {
      setSending(false);
    }
  };

  if (!focus) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: depth > 1 ? 24 : 0 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ x: { type: "spring", stiffness: 320, damping: 32 }, opacity: { duration: 0.15 } }}
      className="fixed inset-x-0 z-50 flex flex-col bg-background"
      style={{ top: offsetTop, height }}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Tiding
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* The tiding, collapsed for context. */}
        <div className="flex gap-2 pb-3 opacity-60">
          <Avatar url={tidingAuthor?.avatar_url} handle={tidingAuthor?.handle} small />
          <div className="min-w-0 flex-1">
            <span className="text-[13px] font-semibold">{tidingAuthor?.handle}</span>
            <p className="line-clamp-2 break-words text-sm text-foreground/70">{tiding.body}</p>
          </div>
        </div>
        <div className="ml-4 h-4 w-0.5 bg-border" />

        {/* The focused reply, treated like the main post here. */}
        <div className="flex gap-2.5 border-b border-border pb-3">
          <button
            onClick={() => onOpenProfile?.(focus.author_subject_id)}
            className="h-10 shrink-0"
            title={`View ${focus.author_handle}'s crest`}
          >
            <Avatar url={null} handle={focus.author_handle} />
          </button>
          <div className="min-w-0 flex-1">
            <button
              onClick={() => onOpenProfile?.(focus.author_subject_id)}
              className="max-w-full truncate text-[15px] font-semibold hover:underline"
            >
              {focus.author_handle}
            </button>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-normal text-foreground/95">
              {focus.body}
            </p>
            <div className="mt-2 flex items-center gap-6">
              <button
                onClick={() => onCheerReply(focus.id)}
                disabled={busy}
                className={cn(
                  "flex items-center gap-1.5 text-[13px] transition",
                  cheered ? "text-primary" : "text-muted-foreground hover:text-primary"
                )}
              >
                <Tankard className={cn("h-[18px] w-[18px]", cheered && "fill-current")} />
                {focus.cheers_count > 0 && <span className="tnum">{focus.cheers_count}</span>}
              </button>
            </div>
          </div>
        </div>

        {/* Its direct replies, each still collapsed until tapped further. */}
        <div className="mt-3 space-y-3">
          {children.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No replies yet.</p>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {children.length} {children.length === 1 ? "reply" : "replies"}
              </p>
              {children.map((kid) => (
                <ReplyRow
                  key={kid.id}
                  reply={kid}
                  childCount={(byParent.get(kid.id) || []).length}
                  myReplyCheers={myReplyCheers}
                  onCheerReply={onCheerReply}
                  onOpenThread={onOpenThread}
                  onOpenProfile={onOpenProfile}
                  busy={busy}
                />
              ))}
            </>
          )}
        </div>
      </div>

      <form
        onSubmit={submit}
        className="flex shrink-0 items-center gap-2 border-t border-border bg-background px-4 py-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Reply to @${focus.author_handle}...`}
          className="h-10 min-w-0 flex-1 rounded-full border border-border bg-secondary/40 px-3.5 text-sm focus:border-primary/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="flex h-10 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reply"}
        </button>
      </form>
    </motion.div>
  );
}

/**
 * The tiding's own page, X-style: its full content at the top (not the
 * collapsed treatment reserved for context elsewhere), a composer for adding
 * a new top-level reply directly beneath it, then every top-level reply below
 * that, each still collapsed until tapped further. This is the ONLY place
 * existing comments are ever shown, reached only by tapping the tiding's body.
 */
function TidingThread({
  tiding,
  author,
  handle,
  rank,
  cheered,
  onCheer,
  rootReplies,
  byParent,
  loadingReplies,
  myReplyCheers,
  onCheerReply,
  onOpenThread,
  onBack,
  onOpenProfile,
  onSubmitReply,
  busy,
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const { height, offsetTop } = useVisualViewport();

  const submit = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSubmitReply(body);
      setDraft("");
    } catch {
      /* gate opened or realm refused; keep the draft */
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-x-0 z-50 flex flex-col bg-background"
      style={{ top: offsetTop, height }}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Tiding
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* The full tiding, uncollapsed: this page exists to show it properly. */}
        <div className="flex gap-2.5 border-b border-border pb-3">
          <button
            onClick={() => onOpenProfile?.(tiding.author_subject_id)}
            className="h-10 shrink-0"
            title={`View ${handle}'s crest`}
          >
            <Avatar url={author?.avatar_url} handle={handle} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <button
                onClick={() => onOpenProfile?.(tiding.author_subject_id)}
                className="max-w-full truncate text-[15px] font-semibold hover:underline"
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
            <div className="mt-2 flex items-center gap-6">
              <button
                onClick={() => onCheer(tiding.id)}
                disabled={busy}
                className={cn(
                  "flex items-center gap-1.5 text-[13px] transition",
                  cheered ? "text-primary" : "text-muted-foreground hover:text-primary"
                )}
              >
                <Tankard className={cn("h-[18px] w-[18px]", cheered && "fill-current")} />
                {tiding.cheers_count > 0 && <span className="tnum">{tiding.cheers_count}</span>}
              </button>
            </div>
          </div>
        </div>

        {/* Add a new top-level reply, right where X puts its quick-reply box. */}
        <form onSubmit={submit} className="flex items-center gap-2 border-b border-border py-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply to this tiding..."
            className="h-9 min-w-0 flex-1 rounded-full border border-border bg-secondary/40 px-3.5 text-sm focus:border-primary/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="flex h-9 shrink-0 items-center rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reply"}
          </button>
        </form>

        {/* Every top-level reply, each still collapsed until tapped further. */}
        <div className="mt-3 space-y-3">
          {loadingReplies ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : rootReplies.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No replies yet.</p>
          ) : (
            rootReplies.map((r) => (
              <ReplyRow
                key={r.id}
                reply={r}
                childCount={(byParent.get(r.id) || []).length}
                myReplyCheers={myReplyCheers}
                onCheerReply={onCheerReply}
                onOpenThread={onOpenThread}
                onOpenProfile={onOpenProfile}
                busy={busy}
              />
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Opened by the comment ICON, X-style: composing only, never a view of what
 * is already there. The tiding shown compact for context, one field, one
 * button. Closes itself and returns to the feed the instant a reply is sent.
 */
function QuickCompose({ tiding, tidingAuthor, onClose, onSubmit }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const { height, offsetTop } = useVisualViewport();

  const submit = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSubmit(body);
    } catch {
      setSending(false); // stay open with the draft intact so nothing is lost
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-x-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-6"
      style={{ top: offsetTop, height }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="w-full max-w-md rounded-t-3xl border border-border bg-card p-4 sm:rounded-3xl sm:p-5"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Reply
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-5 w-5 rotate-90" />
          </button>
        </div>

        <div className="mb-3 flex gap-2 opacity-60">
          <Avatar url={tidingAuthor?.avatar_url} handle={tidingAuthor?.handle} small />
          <div className="min-w-0 flex-1">
            <span className="text-[13px] font-semibold">{tidingAuthor?.handle}</span>
            <p className="line-clamp-2 break-words text-sm text-foreground/70">{tiding.body}</p>
          </div>
        </div>

        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add your voice..."
            className="h-11 min-w-0 flex-1 rounded-full border border-border bg-background/60 px-4 text-base focus:border-primary/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="flex h-11 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
          </button>
        </form>
      </motion.div>
    </motion.div>
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
