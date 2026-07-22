import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A small, dependency-free emoji picker in X's spirit: a button that opens a
 * tabbed, scrollable grid and drops the chosen emoji at the cursor. Emojis are
 * plain unicode, so nothing special is needed to render them in a tiding; this
 * is purely the composing side.
 *
 * The first category is the realm's own, because a kingdom app should offer a
 * crown before it offers a taco.
 */

const CATEGORIES = [
  {
    key: "realm",
    tab: "👑",
    emojis: [
      "👑", "⚔️", "🛡️", "🏰", "🐉", "🗡️", "🏹", "🐎", "🍺", "🍷",
      "📜", "🔥", "⚜️", "🥇", "💰", "🗝️", "🕯️", "⚖️", "☠️", "🔮",
    ],
  },
  {
    key: "smileys",
    tab: "😀",
    emojis: [
      "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂",
      "😉", "😌", "😍", "🥰", "😘", "😜", "🤪", "🤨", "😎", "🥳",
      "😏", "😒", "😔", "😢", "😭", "😤", "😠", "😡", "🤬", "😱",
      "🥵", "😴", "🤤", "😈", "💀", "🤡",
    ],
  },
  {
    key: "gestures",
    tab: "👍",
    emojis: [
      "👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "✊", "👊", "✌️",
      "🤞", "🫡", "🫶", "🖐️", "✋", "👌", "🤌", "🫰", "👀", "🫂",
    ],
  },
  {
    key: "hearts",
    tab: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️",
      "💕", "💞", "💓", "💗", "💖", "💘", "💝",
    ],
  },
  {
    key: "nature",
    tab: "✨",
    emojis: [
      "🔥", "✨", "⭐", "🌟", "💫", "⚡", "🌙", "☀️", "🌈", "🌊",
      "🌿", "🍀", "🌹", "🥀", "🐺", "🦅", "🦁", "🐗", "🌲", "🏔️",
    ],
  },
  {
    key: "food",
    tab: "🍖",
    emojis: [
      "🍺", "🍷", "🍞", "🧀", "🍖", "🍗", "🍎", "🍇", "🥩", "🍲",
      "🥧", "🍯", "🧂", "🍄", "☕", "🥂",
    ],
  },
  {
    key: "symbols",
    tab: "✅",
    emojis: [
      "✅", "❌", "❗", "❓", "💯", "⚜️", "♠️", "♥️", "♦️", "♣️",
      "⭐", "✝️", "☯️", "🔔", "📯", "🏆",
    ],
  },
];

const RECENT_KEY = "ascend_recent_emoji";
const RECENT_MAX = 20;

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

export function EmojiPicker({ onPick }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("realm");
  const [recent, setRecent] = useState(loadRecent);
  const wrap = useRef(null);

  // Close on an outside click or Escape, the way a real popover behaves.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (emoji) => {
    onPick(emoji);
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const tabs = recent.length
    ? [{ key: "recent", tab: "🕘", emojis: recent }, ...CATEGORIES]
    : CATEGORIES;
  const current = tabs.find((c) => c.key === active) || tabs[0];

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Add an emoji"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full text-primary transition hover:bg-primary/10",
          open && "bg-primary/10"
        )}
      >
        <Smile className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-40 w-[300px] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
          {/* Category tabs */}
          <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1">
            {tabs.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setActive(c.key)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-lg transition",
                  active === c.key ? "bg-primary/15" : "hover:bg-secondary"
                )}
              >
                {c.tab}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="grid max-h-52 grid-cols-7 gap-0.5 overflow-y-auto p-1.5">
            {current.emojis.map((e, i) => (
              <button
                key={`${e}-${i}`}
                type="button"
                onClick={() => pick(e)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition hover:bg-secondary"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
