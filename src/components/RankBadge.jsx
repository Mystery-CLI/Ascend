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

// Crest art is a photo, not a bold vector glyph, so it needs real size to
// read at all. Bumped up a size class across the board (xs used to be the
// size sm is now) so the crest is actually recognizable, not a smudge.
const SIZE = {
  xs: { icon: "h-4 w-4", text: "text-[10px]", pad: "px-2 py-1", gap: "gap-1" },
  sm: { icon: "h-5 w-5", text: "text-[11px]", pad: "px-2.5 py-1", gap: "gap-1.5" },
  lg: { icon: "h-7 w-7", text: "text-xs", pad: "px-3 py-1.5", gap: "gap-2" },
};

export function RankBadge({ rank = "peasant", size = "sm", showLabel = true, className }) {
  const meta = rankMeta(rank);
  const crest = CREST[meta.key] || CREST.peasant;
  const s = SIZE[size] || SIZE.sm;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-black/30 ring-1",
        s.pad,
        s.gap,
        RING[meta.key],
        TEXT[meta.key],
        className
      )}
    >
      <img src={crest} alt="" className={cn("shrink-0 rounded-full object-cover", s.icon)} />
      {showLabel && (
        <span className={cn("font-display font-semibold uppercase tracking-wider", s.text)}>
          {meta.label}
        </span>
      )}
    </span>
  );
}
