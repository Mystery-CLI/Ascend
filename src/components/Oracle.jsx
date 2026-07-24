import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Send, Wand2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";

const STARTERS = [
  "How do I rise from Peasant to Freeman?",
  "What does the reigning Monarch's Decree do?",
  "How does the Rookery decide who can raven whom?",
];

/**
 * The Oracle: Ascend's own answer to X's Grok, an AI advisor built into the
 * realm. Conversation lives only in this component's state, on purpose --
 * nothing is persisted server-side, the backend just needs the last few
 * turns for context. Rate-limited server-side (20/day), enforced by the
 * oracle function itself; this view just reflects the count it reports back.
 */
export function Oracle({ me }) {
  const [messages, setMessages] = useState([]); // { role: "user" | "oracle", content }
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState(null); // { used, limit } once known
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const ask = async (text) => {
    const question = text.trim().slice(0, 500);
    if (!question || sending) return;
    setDraft("");
    const history = messages.slice(-6);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setSending(true);
    try {
      const res = await base44.functions.invoke("oracle", {
        action: "ask",
        message: question,
        history,
      });
      setMessages((prev) => [...prev, { role: "oracle", content: res.data.answer }]);
      setUsage({ used: res.data.used, limit: res.data.limit });
    } catch (err) {
      notify(err?.response?.data?.error || err.message || "The Oracle did not answer.");
    } finally {
      setSending(false);
    }
  };

  const atLimit = usage && usage.used >= usage.limit;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col px-4 py-5 sm:h-[calc(100vh-6rem)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
            <Wand2 className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-display text-xl font-bold text-primary">The Oracle</h2>
        </div>
        {usage && (
          <span className="tnum text-xs text-muted-foreground">
            {usage.used}/{usage.limit} today
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-2xl border border-border bg-card/30 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Sparkles className="h-6 w-6 text-primary/70" />
            <p className="max-w-xs text-sm text-muted-foreground">
              Ask the Oracle anything, about the realm, or anything else on your mind.
            </p>
            <div className="flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-full border border-border px-3.5 py-1.5 text-xs text-foreground/80 transition hover:bg-secondary/60"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    m.role === "user"
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-secondary text-foreground"
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-secondary px-3.5 py-2.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
        className="mt-3 flex shrink-0 items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 500))}
          placeholder={atLimit ? "The Oracle rests until dawn." : "Ask the Oracle..."}
          disabled={atLimit || sending}
          className="h-11 min-w-0 flex-1 rounded-full border border-border bg-secondary/40 px-4 text-sm focus:border-primary/60 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending || atLimit}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
