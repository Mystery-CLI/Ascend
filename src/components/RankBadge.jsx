import { Sprout, Hammer, Sword, Gem, Crown } from "lucide-react";
import { rankMeta } from "@/lib/ranks";
import { cn } from "@/lib/utils";

// Placeholder heraldry. Day 5 swaps these for the painted copper-to-gold crests;
// for now a lucide glyph per rank keeps the hierarchy legible at a glance.
const ICON = {
  peasant: Sprout,
  freeman: Hammer,
  knight: Sword,
  noble: Gem,
  monarch: Crown,
};

const TEXT = {
  peasant: "text-rank-peasant",
  freeman: "text-rank-freeman",
  knight: "text-rank-knight",
  noble: "text-rank-noble",
  monarch: "text-rank-monarch",
};

const RING = {
  peasant: "ring-rank-peasant/30",
  freeman: "ring-rank-freeman/30",
  knight: "ring-rank-knight/40",
  noble: "ring-rank-noble/40",
  monarch: "ring-rank-monarch/50",
};

export function RankBadge({ rank = "peasant", size = "sm", showLabel = true, className }) {
  const meta = rankMeta(rank);
  const Icon = ICON[meta.key] || Sprout;
  const compact = size === "xs";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-black/30 ring-1",
        compact ? "px-1.5 py-0.5" : "px-2 py-0.5",
        RING[meta.key],
        TEXT[meta.key],
        className
      )}
    >
      <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {showLabel && (
        <span
          className={cn(
            "font-display font-semibold uppercase tracking-wider",
            compact ? "text-[9px]" : "text-[10px]"
          )}
        >
          {meta.label}
        </span>
      )}
    </span>
  );
}
