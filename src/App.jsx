import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Crown, Loader2, ScrollText, Sparkles, ScrollText as Scroll, Feather, User } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { realm, pulse } from "@/lib/realm";
import { hasFealty, markFealty, clearFealty } from "@/lib/session";
import { rankMeta, climbProgress } from "@/lib/ranks";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/toast";
import { FealtyGate } from "@/components/FealtyGate";
import { RankBadge } from "@/components/RankBadge";
import { TidingCard } from "@/components/TidingCard";
import { Composer } from "@/components/Composer";
import { Rookery } from "@/components/Rookery";
import { ThroneRoom } from "@/components/ThroneRoom";
import { Profile } from "@/components/Profile";
import { ToastHost } from "@/components/Toast";

const FEED_LIMIT = 60;
const POLL_MS = 8000;

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [me, setMe] = useState(null); // my Subject (renown is readable to me)
  const [tidings, setTidings] = useState([]);
  const [subjects, setSubjects] = useState({}); // id -> Subject (public rank)
  const [myCheers, setMyCheers] = useState(new Set());
  const [myReplyCheers, setMyReplyCheers] = useState(new Set());
  const [myVotes, setMyVotes] = useState(new Map()); // tiding_id -> option_index
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ascension, setAscension] = useState(null); // rank-up celebration
  const [gate, setGate] = useState(null); // { reason } when the login modal is open
  const [view, setView] = useState("tavern"); // tavern | rookery
  const [ravenTarget, setRavenTarget] = useState(null); // subject to open a thread with
  const meRef = useRef(null);
  meRef.current = me;

  // Start a raven to a subject (from a tiding). Requires fealty; opens the Rookery.
  const messageSubject = useCallback(
    (subject) => {
      if (!subject) return;
      if (!meRef.current) {
        setGate({ reason: "Enter the realm to send a raven." });
        return;
      }
      if (subject.id === meRef.current.id) return;
      setRavenTarget(subject);
      setView("rookery");
    },
    []
  );

  // The tavern is open to all, X-style. This gate only appears when a visitor
  // who has not sworn fealty tries to ACT. Returns true if they may proceed.
  const requireFealty = useCallback(
    (reason) => {
      if (meRef.current) return true;
      setGate({ reason });
      return false;
    },
    []
  );

  /* ---- data ------------------------------------------------------------ */

  const loadFeed = useCallback(async () => {
    const [tRows, sRows] = await Promise.all([
      base44.entities.Tiding.list("-created_date", FEED_LIMIT).catch(() => []),
      base44.entities.Subject.list("", 500).catch(() => []),
    ]);
    const map = {};
    for (const s of sRows) map[s.id] = s;
    setTidings(tRows);
    setSubjects(map);

    const mine = meRef.current;
    if (mine) {
      const [cheers, votes] = await Promise.all([
        base44.entities.Cheer.filter({ subject_id: mine.id }).catch(() => []),
        base44.entities.Vote.filter({ subject_id: mine.id }).catch(() => []),
      ]);
      setMyCheers(new Set(cheers.filter((c) => !c.reply_id).map((c) => c.tiding_id)));
      setMyReplyCheers(new Set(cheers.filter((c) => c.reply_id).map((c) => c.reply_id)));
      setMyVotes(new Map(votes.map((v) => [v.tiding_id, v.option_index])));
      // Refresh my own standing (renown is private but readable to me).
      const fresh = map[mine.id];
      if (fresh) setMe((prev) => ({ ...prev, ...fresh }));
    }
  }, []);

  // Boot: load the tavern for everyone, then quietly check whether the visitor
  // has sworn fealty. The feed never waits on auth.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadFeed();
      if (cancelled) return;
      setLoading(false);

      // Only ask the server who they are if this device has signed in before.
      // A first-time onlooker never triggers an auth probe, so the public
      // tavern stays 401-free in the console.
      if (!hasFealty()) {
        setAuthChecked(true);
        return;
      }

      const u = await base44.auth.me().catch(() => null);
      if (cancelled) return;
      setUser(u);
      setAuthChecked(true);
      if (u) {
        try {
          const { subject } = await realm("enter");
          if (!cancelled) setMe(subject);
        } catch {
          /* enter failed; the visitor can still read the tavern */
        }
        await loadFeed(); // re-run now that we know who they are (for cheers)
      } else {
        // The stored session is gone; forget it so we stop probing.
        clearFealty();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFeed]);

  const logout = useCallback(() => {
    clearFealty();
    base44.auth.logout(window.location.origin);
  }, []);

  // Called after a successful oath from the modal: bring the new subject in
  // without a jarring full-page reload.
  const onAuthed = useCallback(async () => {
    setGate(null);
    markFealty();
    const u = await base44.auth.me().catch(() => null);
    setUser(u);
    if (u) {
      try {
        const { subject } = await realm("enter");
        setMe(subject);
      } catch {
        /* ignore */
      }
      await loadFeed();
    }
  }, [loadFeed]);

  // Live tavern: the server rewrites a tiding's counts on every cheer and reply,
  // so subscribing to Tiding covers posts, cheers, and replies alike. A slow
  // poll sits behind it as a safety net (a subscription can miss its first
  // events before the socket is ready).
  // The public tavern stays live for everyone via a slow poll. The realtime
  // socket subscription is opened ONLY for signed-in subjects: an anonymous
  // socket retries auth forever and floods the console with 401s (a Base44
  // quirk on public apps), and onlookers do not need sub-second freshness.
  useEffect(() => {
    let timer;
    const poll = setInterval(loadFeed, POLL_MS);
    let unsub;
    if (user) {
      const refresh = () => {
        clearTimeout(timer);
        timer = setTimeout(loadFeed, 250);
      };
      try {
        unsub = base44.entities.Tiding.subscribe(refresh);
      } catch {
        /* fall back to the poll */
      }
    }
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      unsub?.();
    };
  }, [user, loadFeed]);

  /* ---- standing changes ------------------------------------------------ */

  const applyStanding = useCallback((res) => {
    if (!res || res.renown === undefined) return;
    setMe((prev) => {
      if (!prev) return prev;
      const roseTo =
        res.rank && res.rank !== prev.rank && rankMeta(res.rank).order > rankMeta(prev.rank).order
          ? res.rank
          : null;
      if (roseTo) setAscension(roseTo);
      return { ...prev, renown: res.renown, rank: res.rank ?? prev.rank };
    });
  }, []);

  /* ---- actions --------------------------------------------------------- */

  const post = async ({ media = [], mediaKind, mediaPoster, pollOptions, pollHours } = {}) => {
    if (!requireFealty("Only subjects of the realm may post to the tavern.")) return false;
    const body = draft.trim();
    const hasPoll = Array.isArray(pollOptions) && pollOptions.length >= 2;
    if ((!body && media.length === 0 && !hasPoll) || posting) return false;
    setPosting(true);
    try {
      const res = await realm("post", {
        body,
        media,
        media_kind: mediaKind,
        media_poster: mediaPoster,
        poll_options: hasPoll ? pollOptions : undefined,
        poll_hours: pollHours,
      });
      setDraft("");
      applyStanding(res);
      await loadFeed();
      // A citizen may answer the newcomer. Nudge the populace, then refresh once
      // the reply has had a moment to land, so the tavern feels responsive.
      pulse().then((r) => {
        if (r?.acted) setTimeout(loadFeed, 600);
      });
      return true;
    } catch (err) {
      notify(err.message);
      return false;
    } finally {
      setPosting(false);
    }
  };

  const vote = async (tidingId, idx) => {
    if (!requireFealty("Enter the realm to cast your vote.")) return;
    if (myVotes.has(tidingId)) return; // one ballot only
    // Optimistic: record my choice and bump the tally so results show at once.
    setMyVotes((prev) => new Map(prev).set(tidingId, idx));
    setTidings((prev) =>
      prev.map((t) => {
        if (t.id !== tidingId) return t;
        const v = Array.isArray(t.poll_votes) ? [...t.poll_votes] : (t.poll_options || []).map(() => 0);
        v[idx] = (v[idx] || 0) + 1;
        return { ...t, poll_votes: v };
      })
    );
    try {
      const res = await realm("vote", { tiding_id: tidingId, option_index: idx });
      if (res?.already !== undefined || res?.voted) {
        setMyVotes((prev) => new Map(prev).set(tidingId, res.option_index));
      }
      applyStanding(res);
    } catch (err) {
      notify(err.message);
      await loadFeed();
    }
  };

  /* ---- rank powers ----------------------------------------------------- */

  const runPower = async (label, fn) => {
    try {
      const res = await fn();
      await loadFeed();
      return res;
    } catch (err) {
      notify(err.message);
    }
  };

  const champion = (tidingId) =>
    runPower("champion", () => realm("champion", { tiding_id: tidingId }));

  const proclaim = (tidingId) =>
    runPower("proclaim", () => realm("proclaim", { tiding_id: tidingId }));

  const bounty = async (subjectId) => {
    const res = await runPower("bounty", () => realm("bounty", { subject_id: subjectId }));
    if (res?.granted) {
      notify(`Bounty granted: +${res.granted} renown to a commoner of the realm.`, "success");
    }
  };

  const cheer = async (tidingId) => {
    if (!requireFealty("Raise a tankard? Enter the realm first, and your cheer will count.")) return;
    if (busy) return;
    setBusy(true);
    // Optimistic: flip my cheer and nudge the count so it feels instant.
    const had = myCheers.has(tidingId);
    setMyCheers((prev) => {
      const next = new Set(prev);
      had ? next.delete(tidingId) : next.add(tidingId);
      return next;
    });
    setTidings((prev) =>
      prev.map((t) =>
        t.id === tidingId
          ? { ...t, cheers_count: Math.max(0, (t.cheers_count || 0) + (had ? -1 : 1)) }
          : t
      )
    );
    try {
      const res = await realm("cheer", { tiding_id: tidingId });
      applyStanding(res);
    } catch (err) {
      notify(err.message);
      await loadFeed(); // reconcile on failure
    } finally {
      setBusy(false);
    }
  };

  const reply = async (tidingId, body, parentReplyId) => {
    if (!requireFealty("Add your voice? Swear fealty and the tavern will hear you.")) {
      throw new Error("fealty required"); // stops the card's local submit spinner
    }
    const res = await realm("reply", { tiding_id: tidingId, body, parent_reply_id: parentReplyId });
    setTidings((prev) =>
      prev.map((t) =>
        t.id === tidingId ? { ...t, replies_count: (t.replies_count || 0) + 1 } : t
      )
    );
    return res.reply;
  };

  // Cheering a reply, X-style: same optimistic-Set pattern as cheering a
  // tiding, but the reply's own cheers_count lives inside TidingCard's local
  // replies list, so that count is updated there, not here.
  const cheerReply = async (replyId) => {
    if (!requireFealty("Raise a tankard? Enter the realm first, and your cheer will count.")) {
      throw new Error("fealty required");
    }
    if (busy) return;
    setBusy(true);
    const had = myReplyCheers.has(replyId);
    setMyReplyCheers((prev) => {
      const next = new Set(prev);
      had ? next.delete(replyId) : next.add(replyId);
      return next;
    });
    try {
      await realm("cheer", { reply_id: replyId });
    } catch (err) {
      notify(err.message);
      setMyReplyCheers((prev) => {
        const next = new Set(prev);
        had ? next.add(replyId) : next.delete(replyId);
        return next;
      });
      throw err;
    } finally {
      setBusy(false);
    }
  };

  /* ---- ordering -------------------------------------------------------- */

  const ordered = useMemo(() => {
    const now = Date.now();
    const weight = (t) => {
      if (t.proclaimed) return 2;
      if (t.championed_until && new Date(t.championed_until).getTime() > now) return 1;
      return 0;
    };
    return [...tidings].sort((a, b) => {
      const w = weight(b) - weight(a);
      if (w !== 0) return w;
      return new Date(b.created_date) - new Date(a.created_date);
    });
  }, [tidings]);

  /* ---- render ---------------------------------------------------------- */

  // Only the very first feed load blocks. After that the tavern is always shown,
  // to subjects and onlookers alike.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const progress = me ? climbProgress(me.rank, me.renown) : null;
  const backdrop =
    view === "throne" ? "/art/throne.jpg" : view === "rookery" ? "/art/throne.jpg" : "/art/tavern.jpg";

  return (
    <div className="min-h-screen">
      <ToastHost />

      {/* A painted backdrop for the current room, kept faint and darkened so the
          feed stays readable. This is what gives Ascend its painterly kingdom
          feel without fighting the content. */}
      <div className="pointer-events-none fixed inset-0" style={{ zIndex: -1 }}>
        <img
          key={backdrop}
          src={backdrop}
          alt=""
          className="h-full w-full object-cover opacity-[0.16]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
      </div>

      {/* Desktop only: a left nav rail sits beside the content, X-style,
          instead of the same 600px column floating alone in empty margin.
          Hidden entirely below `lg`, so mobile/tablet render exactly as
          before; the bottom nav further down takes over there instead. */}
      <div className="mx-auto flex w-full max-w-4xl lg:items-start lg:gap-6">
        <aside className="hidden shrink-0 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-56 lg:flex-col lg:py-6 lg:pl-2">
          <div className="flex items-center gap-2 px-3">
            <Crown className="h-6 w-6 text-primary" />
            <span className="font-display text-xl font-bold text-primary">Ascend</span>
          </div>
          <nav className="mt-6 flex flex-col gap-1">
            <SidebarLink active={view === "tavern"} onClick={() => setView("tavern")} icon={Scroll} label="Tavern" />
            <SidebarLink active={view === "throne"} onClick={() => setView("throne")} icon={Crown} label="Throne" />
            <SidebarLink
              active={view === "rookery"}
              onClick={() =>
                me ? setView("rookery") : setGate({ reason: "Enter the realm to open the Rookery." })
              }
              icon={Feather}
              label="Rookery"
            />
            {me && (
              <SidebarLink
                active={view === "profile"}
                onClick={() => setView("profile")}
                icon={User}
                label="Your Crest"
              />
            )}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
      {/* Standing bar: your crest, your rank, your renown (yours to see alone) */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <span className="font-display text-lg font-bold text-primary">Ascend</span>
          </div>

          {me ? (
            <button onClick={() => setView("profile")} className="text-right" title="Your crest">
              <div className="flex items-center justify-end gap-2">
                <span className="max-w-[9rem] truncate text-sm font-medium">{me.handle}</span>
                <RankBadge rank={me.rank} size="xs" />
              </div>
              <div className="tnum text-[11px] text-muted-foreground">
                {me.renown ?? 0} renown
              </div>
            </button>
          ) : (
            <button
              onClick={() => setGate({ reason: "Enter the realm a peasant, and begin your climb." })}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110"
            >
              Enter the realm
            </button>
          )}
        </div>

        {/* Climb toward the next rank */}
        {progress && (
          <div className="mx-auto max-w-2xl px-4 pb-2">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span>{rankMeta(me.rank).label}</span>
              <span>
                {progress.into}/{progress.span} to {progress.next.label}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${progress.pct}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
          </div>
        )}
      </header>

      {view === "tavern" && (
      <main className="mx-auto max-w-[600px] pb-20 sm:px-4 sm:py-5">
        <div className="overflow-hidden border-border bg-card/30 sm:rounded-2xl sm:border">
          {/* Compose, subjects only. Onlookers get an invitation instead. */}
          {me ? (
            <Composer
              me={me}
              draft={draft}
              setDraft={(v) => setDraft(v.slice(0, 600))}
              onPost={post}
              posting={posting}
            />
          ) : (
            <button
              onClick={() => setGate({ reason: "Only subjects of the realm may post to the tavern." })}
              className="flex w-full items-center gap-2 border-b border-border px-4 py-4 text-left text-sm text-muted-foreground transition hover:bg-foreground/[0.02] hover:text-foreground"
            >
              <ScrollText className="h-4 w-4 shrink-0" />
              Enter the realm to post a tiding, raise a tankard, and begin your climb.
            </button>
          )}

          {/* The board */}
          {ordered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground">
                The tavern is quiet. Be the first to raise your voice.
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {ordered.map((t) => (
                <TidingCard
                  key={t.id}
                  tiding={t}
                  author={subjects[t.author_subject_id]}
                  cheered={myCheers.has(t.id)}
                  onCheer={cheer}
                  onReply={reply}
                  myRank={me?.rank}
                  onChampion={champion}
                  onProclaim={proclaim}
                  onBounty={bounty}
                  myVoteIndex={myVotes.has(t.id) ? myVotes.get(t.id) : undefined}
                  onVote={vote}
                  onMessageSubject={(id) => messageSubject(subjects[id])}
                  busy={busy}
                  myReplyCheers={myReplyCheers}
                  onCheerReply={cheerReply}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </main>
      )}

      {view === "rookery" && me && (
        <div className="mx-auto max-w-[600px] pb-14">
          <Rookery
            me={me}
            subjects={subjects}
            startWith={ravenTarget}
            onConsumedStart={() => setRavenTarget(null)}
          />
        </div>
      )}

      {view === "throne" && (
        <div className="mx-auto max-w-[600px] pb-20 sm:py-3">
          <ThroneRoom me={me} onStanding={applyStanding} onGoToTavern={() => setView("tavern")} />
        </div>
      )}

      {view === "profile" && me && (
        <div className="mx-auto max-w-[600px] pb-20 sm:py-3">
          <Profile
            me={me}
            user={user}
            onUpdated={(patch) => setMe((prev) => ({ ...prev, ...patch }))}
            onLogout={logout}
          />
        </div>
      )}
        </div>
      </div>

      {/* Bottom nav: mobile/tablet only, replaced by the sidebar above `lg`.
          Tavern and Throne are public; the Rookery needs fealty.
          `translateZ(0)` forces this onto its own compositing layer: without
          it, iOS Safari can visually detach a `fixed` element mid-scroll
          (it "floats" over the wrong content until the scroll settles). */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 mx-auto flex h-14 max-w-[600px] items-stretch border-t border-border bg-background/90 backdrop-blur-md lg:hidden"
        style={{ transform: "translateZ(0)", WebkitTransform: "translateZ(0)" }}
      >
        <NavButton active={view === "tavern"} onClick={() => setView("tavern")} icon={Scroll} label="Tavern" />
        <NavButton active={view === "throne"} onClick={() => setView("throne")} icon={Crown} label="Throne" />
        <NavButton
          active={view === "rookery"}
          onClick={() =>
            me ? setView("rookery") : setGate({ reason: "Enter the realm to open the Rookery." })
          }
          icon={Feather}
          label="Rookery"
        />
      </nav>

      {/* The fealty gate, summoned by any act that needs a subject */}
      <AnimatePresence>
        {gate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/85 p-5 backdrop-blur-md"
            onClick={(e) => {
              if (e.target === e.currentTarget) setGate(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
            >
              <FealtyGate
                reason={gate.reason}
                onClose={() => setGate(null)}
                onAuthed={onAuthed}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ascension: a rank-up is a moment, so it gets a moment */}
      <AnimatePresence>
        {ascension && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAscension(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="max-w-xs rounded-3xl border border-primary/40 bg-card p-8 text-center"
            >
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                You have ascended
              </p>
              <p className="mt-2 font-display text-3xl font-bold text-primary">
                {rankMeta(ascension).label}
              </p>
              <div className="mt-4 flex justify-center">
                <RankBadge rank={ascension} size="sm" />
              </div>
              <button
                onClick={() => setAscension(null)}
                className="mt-6 w-full rounded-xl bg-primary/15 py-2 text-sm font-medium text-primary"
              >
                Rise
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The desktop nav rail's own item: icon and label side by side, X-style. */
function SidebarLink({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3.5 rounded-full px-3 py-2.5 text-base font-medium transition",
        active ? "text-primary" : "text-foreground/90 hover:bg-secondary/60"
      )}
    >
      <Icon className={cn("h-6 w-6", active && "fill-primary/10")} />
      {label}
    </button>
  );
}

function NavButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium uppercase tracking-wider transition",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className={cn("h-5 w-5", active && "fill-primary/10")} />
      {label}
    </button>
  );
}
