import { useEffect, useRef, useState } from "react";
import { Play, Pause, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A bespoke audio player for tidings, in place of the browser's bare native
 * controls (which look inconsistent across devices and cheap next to the rest
 * of the app). Play/pause, a scrubbable progress bar, elapsed/total time, and a
 * row of decorative bars that come alive while playing, styled with the same
 * gold-on-dark language as everything else in the realm.
 */
export function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrent(audio.currentTime);
    const onMeta = () => {
      setDuration(audio.duration || 0);
      setLoaded(true);
    };
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    // The play/pause icon reflects the real <audio> element's own state, not
    // an optimistic guess. If a second instance of this same clip exists
    // elsewhere (the tiding shown again for context in a thread view, say),
    // each instance now correctly shows only ITS OWN playback, instead of
    // one flipping to "playing" while the actual sound comes from another.
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  const toggle = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  const seek = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  };

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-2 overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-card to-card/60 p-4"
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center gap-3.5">
        <button
          onClick={toggle}
          disabled={!loaded}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.35)] transition hover:brightness-110 disabled:opacity-50"
        >
          {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-1.5 text-primary/80">
            <Music2 className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-[0.16em]">Tavern recording</span>
          </div>

          {/* Decorative bars, alive only while playing. Not a real waveform
              analysis, a light touch of motion so the card does not feel
              inert while sound is coming out of it. */}
          <div className="flex h-5 items-center gap-[3px]">
            {BAR_HEIGHTS.map((h, i) => (
              <span
                key={i}
                className={cn(
                  "w-[3px] rounded-full bg-primary/70 transition-all",
                  playing ? "animate-pulse" : ""
                )}
                style={{
                  height: `${h}%`,
                  animationDelay: `${i * 90}ms`,
                  animationDuration: `${700 + (i % 4) * 120}ms`,
                  opacity: playing ? 1 : 0.35,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div
        onClick={seek}
        className="mt-3 h-1.5 cursor-pointer rounded-full bg-secondary"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="tnum mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{formatTime(current)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

// A fixed, varied set of bar heights so the idle state already looks like a
// waveform rather than a row of identical ticks.
const BAR_HEIGHTS = [40, 70, 100, 55, 85, 45, 95, 60, 75, 35, 90, 50, 65, 80, 45, 55];

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
