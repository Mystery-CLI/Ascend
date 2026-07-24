import { useMemo, useState } from "react";
import { Search as SearchIcon, ArrowLeft, X } from "lucide-react";
import { RankBadge } from "@/components/RankBadge";
import { cn } from "@/lib/utils";

/**
 * X-style search: people and tidings, matched client-side against what's
 * already loaded (the realm's whole population and the current feed window)
 * rather than a separate backend search index -- proportionate to a kingdom
 * this size. Two render shapes off one core: `variant="panel"` for the
 * always-visible desktop sidebar widget, `variant="page"` for the mobile
 * full-screen view opened from the header's search icon.
 */
export function Search({ variant = "panel", subjects, tidings, onOpenProfile, onClose }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const people = useMemo(() => {
    if (!q) return [];
    return Object.values(subjects || {})
      .filter((s) => (s.handle || "").toLowerCase().includes(q) || (s.username || "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [q, subjects]);

  const posts = useMemo(() => {
    if (!q) return [];
    return (tidings || []).filter((t) => (t.body || "").toLowerCase().includes(q)).slice(0, 8);
  }, [q, tidings]);

  const hasResults = people.length > 0 || posts.length > 0;

  const input = (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the realm"
        autoFocus={variant === "page"}
        className="h-11 w-full rounded-full border border-border bg-secondary/40 pl-10 pr-9 text-sm focus:border-primary/60 focus:outline-none"
      />
      {query && (
        <button
          onClick={() => setQuery("")}
          className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  const results = (
    <>
      {!q ? (
        <p className={cn("text-sm text-muted-foreground", variant === "panel" ? "px-1 pt-3" : "py-12 text-center")}>
          Search for a name, an @username, or words from a tiding.
        </p>
      ) : !hasResults ? (
        <p className={cn("text-sm text-muted-foreground", variant === "panel" ? "px-1 pt-3" : "py-12 text-center")}>
          Nothing found for &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className={cn(variant === "panel" ? "mt-3 space-y-1" : "mt-2")}>
          {people.length > 0 && (
            <div className={variant === "page" ? "border-b border-border" : ""}>
              {variant === "page" && (
                <p className="px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">People</p>
              )}
              {people.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onOpenProfile?.(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-secondary/50",
                    variant === "page" && "rounded-none px-4"
                  )}
                >
                  <Avatar url={s.avatar_url} handle={s.handle} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{s.handle}</span>
                      <RankBadge rank={s.rank} size="xs" showLabel={false} />
                    </div>
                    {s.username && <p className="truncate text-xs text-muted-foreground">@{s.username}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {posts.length > 0 && (
            <div>
              {variant === "page" && (
                <p className="px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Tidings</p>
              )}
              {posts.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onOpenProfile?.(t.author_subject_id)}
                  className={cn(
                    "block w-full rounded-xl px-2 py-2 text-left transition hover:bg-secondary/50",
                    variant === "page" && "rounded-none px-4"
                  )}
                >
                  <span className="text-xs font-semibold text-foreground/90">{t.author_handle}</span>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{t.body}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  if (variant === "page") {
    return (
      <div className="px-4 py-5">
        <div className="mb-4 flex items-center gap-3">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">{input}</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card/40">{results}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-3">
      {input}
      {results}
    </div>
  );
}

function Avatar({ url, handle }) {
  const initial = (handle || "?").charAt(0).toUpperCase();
  if (url) return <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-xs font-semibold text-primary">
      {initial}
    </div>
  );
}
