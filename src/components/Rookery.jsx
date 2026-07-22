import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Loader2, Send, Feather, Crown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { RankBadge } from "@/components/RankBadge";
import { rankMeta } from "@/lib/ranks";
import { cn, timeAgo } from "@/lib/utils";

/**
 * The Rookery: rank-gated ravens between subjects.
 *
 * Reading (the inbox and each thread) is a plain, RLS-restricted entity read, so
 * the client does it directly. Sending goes through the rookery function, which
 * is the only thing that can create a message and the only place the rank rules
 * live. This view just reflects the state the server returns: pending Audiences
 * awaiting a grace, Summons with a daily allowance, open threads that flow.
 */
export function Rookery({ me, subjects, startWith, onConsumedStart }) {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null); // a Conversation, or { newWith: subject }
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const activeRef = useRef(null);
  activeRef.current = active;

  const loadConversations = useCallback(async () => {
    const rows = await base44.entities.Conversation.list("-last_message_at", 100).catch(() => []);
    setConversations(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConversations();
    const poll = setInterval(loadConversations, 6000);
    return () => clearInterval(poll);
  }, [loadConversations]);

  // Open a thread when asked from elsewhere (a "send a raven" on a tiding).
  useEffect(() => {
    if (!startWith) return;
    const existing = conversations.find(
      (c) => c.a_id === startWith.id || c.b_id === startWith.id
    );
    setActive(existing || { newWith: startWith });
    onConsumedStart?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWith, conversations.length]);

  // Load (and poll) messages for the open thread.
  const convId = active && !active.newWith ? active.id : null;
  const loadMessages = useCallback(async () => {
    if (!convId) return;
    const rows = await base44.entities.Message.filter({ conversation_id: convId }, "created_date").catch(
      () => []
    );
    setMessages(rows);
  }, [convId]);

  useEffect(() => {
    setMessages([]);
    setNotice("");
    if (!convId) return;
    loadMessages();
    const poll = setInterval(loadMessages, 4000);
    return () => clearInterval(poll);
  }, [convId, loadMessages]);

  const other = (conv) => {
    if (conv.newWith) return conv.newWith;
    const iAmA = conv.a_email === me.user_email;
    const id = iAmA ? conv.b_id : conv.a_id;
    return {
      id,
      handle: iAmA ? conv.b_handle : conv.a_handle,
      rank: subjects[id]?.rank || "peasant",
      avatar_url: subjects[id]?.avatar_url,
    };
  };

  // The relationship, for showing the right hint before a message is sent.
  const relationOf = (conv) => {
    const o = other(conv);
    const meOrder = rankMeta(me.rank).order;
    const oOrder = rankMeta(o.rank).order;
    const isOpen = !conv.newWith && conv.status === "open";
    if (isOpen || me.rank === "monarch") return { kind: "open" };
    if (meOrder === oOrder) return { kind: "open" };
    // pending / new
    const initiatedByMe = conv.newWith || conv.initiator_id === me.id;
    if (meOrder < oOrder) {
      return initiatedByMe ? { kind: "audience-sent" } : { kind: "reply-opens" };
    }
    return initiatedByMe ? { kind: "summons" } : { kind: "reply-opens" };
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || !active) return;
    const target = other(active);
    setSending(true);
    setNotice("");
    try {
      const res = await base44.functions.invoke("rookery", {
        action: "send",
        target_subject_id: target.id,
        body,
      });
      setDraft("");
      await loadConversations();
      // Re-point active at the real conversation if this was a fresh thread.
      const id = res?.data?.conversation_id;
      if (id) {
        const conv = (await base44.entities.Conversation.list("-last_message_at", 100)).find(
          (c) => c.id === id
        );
        if (conv) setActive(conv);
        await base44.entities.Message.filter({ conversation_id: id }, "created_date")
          .then(setMessages)
          .catch(() => {});
      }
      if (res?.data?.kind === "audience") setNotice("Audience requested. Await their reply.");
      if (res?.data?.kind === "summons") setNotice("Summons sent.");
    } catch (err) {
      setNotice(err?.response?.data?.error || "The raven did not fly.");
    } finally {
      setSending(false);
    }
  };

  /* -- thread view ------------------------------------------------------- */
  if (active) {
    const o = other(active);
    const rel = relationOf(active);
    const canSend = rel.kind !== "audience-sent";

    // A full-screen chat that fits any viewport: header, scrolling messages,
    // and an input pinned to the bottom above the phone's home indicator.
    // Fixed to the viewport so mobile browser chrome cannot push the input off.
    return (
      <div className="fixed inset-0 z-40 mx-auto flex max-w-[600px] flex-col bg-background">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <button onClick={() => setActive(null)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{o.handle}</span>
            <RankBadge rank={o.rank} size="xs" />
          </div>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {rel.kind === "reply-opens" && (
            <Banner icon={Feather}>
              {o.handle} reached across the ranks to you. Your reply opens this thread.
            </Banner>
          )}
          {rel.kind === "audience-sent" && (
            <Banner icon={Crown}>
              You have requested an Audience with {o.handle}. Await their reply.
            </Banner>
          )}
          {rel.kind === "summons" && (
            <Banner icon={Feather}>
              A Summons to one below you. It costs a raven until they reply.
            </Banner>
          )}

          {messages.map((m) => {
            const mine = m.from_id === me.id;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                    mine
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-secondary text-foreground"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <span
                    className={cn(
                      "mt-0.5 block text-[10px]",
                      mine ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}
                  >
                    {timeAgo(m.created_date)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {notice && <p className="shrink-0 px-4 pb-2 text-xs text-muted-foreground">{notice}</p>}

        {canSend ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex shrink-0 items-center gap-2 border-t border-border bg-background px-4 py-3"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
              placeholder="Send a raven..."
              className="h-11 min-w-0 flex-1 rounded-full border border-border bg-secondary/50 px-4 text-sm focus:border-primary/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        ) : (
          <div
            className="shrink-0 border-t border-border px-4 py-4 text-center text-sm text-muted-foreground"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            Awaiting their reply. You cannot send again until they answer.
          </div>
        )}
      </div>
    );
  }

  /* -- inbox ------------------------------------------------------------- */
  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <header className="sticky top-14 z-10 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md">
        <h2 className="font-display text-lg font-bold">The Rookery</h2>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          No ravens yet. Tap a subject in the tavern to send one, mindful of rank.
        </div>
      ) : (
        conversations.map((c) => {
          const o = other(c);
          const pendingIn = c.status === "pending" && c.initiator_id !== me.id;
          return (
            <button
              key={c.id}
              onClick={() => setActive(c)}
              className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition hover:bg-foreground/[0.02]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-display font-semibold text-primary">
                {(o.handle || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">{o.handle}</span>
                  <RankBadge rank={o.rank} size="xs" />
                  {pendingIn && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary">
                      new
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {c.status === "pending" && c.initiator_id === me.id ? "Awaiting reply · " : ""}
                  {c.last_preview || "…"}
                </p>
              </div>
              {c.last_message_at && (
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(c.last_message_at)}</span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

function Banner({ icon: Icon, children }) {
  return (
    <div className="mb-2 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2 text-xs text-foreground/80">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <span>{children}</span>
    </div>
  );
}
