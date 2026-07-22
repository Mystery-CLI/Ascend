import { cn } from "@/lib/utils";

/**
 * X-style media display: one image fills, two sit side by side, three make a
 * big-plus-two, four form a 2x2. A single short video plays inline with
 * controls. Everything is clipped to one rounded frame with a subtle border.
 */
export function MediaGrid({ media = [], kind, poster }) {
  if (!media || media.length === 0) return null;

  if (kind === "video") {
    // With a real poster, use it. Without one (older posts), append a media
    // fragment so the browser seeks to a frame instead of showing black.
    const src = poster ? media[0] : `${media[0]}#t=0.5`;
    return (
      <div className="mt-2 max-h-[520px] overflow-hidden rounded-2xl border border-border bg-black">
        {/* A tall (portrait) video's own aspect ratio can otherwise force this
            box taller than intended: width is a hard 100%, so without
            object-contain the browser has no correct way to shrink a
            9:16 clip down to fit max-h, and it ends up rendering (and
            pushing the layout) far past its frame instead of letterboxing. */}
        <video
          src={src}
          poster={poster || undefined}
          controls
          playsInline
          preload="metadata"
          className="block max-h-[520px] w-full object-contain"
        />
      </div>
    );
  }

  const n = Math.min(media.length, 4);
  const layout =
    n === 1
      ? "grid-cols-1"
      : n === 3
        ? "grid-cols-2 grid-rows-2"
        : "grid-cols-2";

  return (
    <div className={cn("mt-2 grid gap-0.5 overflow-hidden rounded-2xl border border-border", layout)}>
      {media.slice(0, 4).map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          loading="lazy"
          className={cn(
            "h-full w-full object-cover",
            n === 1 ? "max-h-[520px]" : "aspect-square",
            // In the 3-up layout the first image spans both rows on the left.
            n === 3 && i === 0 && "row-span-2"
          )}
        />
      ))}
    </div>
  );
}
