import { rankMeta } from "@/lib/ranks";
import { cn } from "@/lib/utils";

const CREST = {
  peasant: "/art/crest-peasant.jpg",
  freeman: "/art/crest-freeman.jpg",
  knight: "/art/crest-knight.jpg",
  noble: "/art/crest-noble.jpg",
  monarch: "/art/crest-monarch.jpg",
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
  const crest = CREST[meta.key] || CREST.peasant;
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
      <img
        src={crest}
        alt=""
        className={cn("rounded-full object-cover", compact ? "h-3 w-3" : "h-3.5 w-3.5")}
      />
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
