import { useRef, useEffect, useState } from "react";
import { Loader2, ImagePlus, X, ListChecks, Plus, Music2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { EmojiPicker } from "@/components/EmojiPicker";
import { cn } from "@/lib/utils";

const DURATIONS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
];

/**
 * The tavern composer, built on X's pattern: an avatar gutter, a borderless
 * auto-growing field, a media strip, and a toolbar with an emoji picker, a
 * media button, and a circular character gauge beside the Post button.
 *
 * Media go straight to Base44 storage (which returns a public URL) before the
 * tiding is posted, so the post itself just carries the URLs. Up to 4 images,
 * or a single short video, or a single sound/music clip.
 */
const MAX = 600;
const MAX_IMAGES = 4;
const MAX_VIDEO_MB = 50;
const MAX_AUDIO_MB = 25;

export function Composer({ me, draft, setDraft, onPost, posting }) {
  const ref = useRef(null);
  const fileRef = useRef(null);
  const audioFileRef = useRef(null);
  const [media, setMedia] = useState([]); // { url, kind }
  const [mediaPoster, setMediaPoster] = useState(null); // video thumbnail URL
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [poll, setPoll] = useState(null); // { options: string[], hours } | null

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 320) + "px";
  }, [draft]);

  const over = draft.length > MAX;
  const initial = (me?.handle || "?").charAt(0).toUpperCase();
  const hasVideo = media.some((m) => m.kind === "video");
  const hasAudio = media.some((m) => m.kind === "audio");
  const hasExclusiveMedia = hasVideo || hasAudio; // one clip, on its own, no images alongside

  const insertEmoji = (emoji) => {
    const el = ref.current;
    if (!el) {
      setDraft(draft + emoji);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + emoji + draft.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setError("");

    const video = files.find((f) => f.type.startsWith("video/"));
    if (video) {
      if (media.length > 0) return setError("Post a video on its own, not with images or sound.");
      if (video.size > MAX_VIDEO_MB * 1024 * 1024)
        return setError(`Keep the video under ${MAX_VIDEO_MB}MB.`);
      await uploadVideo(video);
      return;
    }

    if (hasExclusiveMedia) return setError("Post a video or sound clip on its own, not with images.");
    const room = MAX_IMAGES - media.length;
    if (room <= 0) return setError(`Up to ${MAX_IMAGES} images.`);
    await uploadImages(files.filter((f) => f.type.startsWith("image/")).slice(0, room));
  };

  // A separate, visibly labelled entry point for sound: the earlier version
  // buried audio inside the same picture-icon picker with no visual hint it
  // could take audio at all, which is exactly as undiscoverable as it sounds.
  //
  // This button takes a sound file OR a video (to pull its audio track from,
  // via the same trick the AudioPlayer itself relies on: an <audio> tag can
  // play the audio track straight out of a video file, no server transcode
  // needed). Some mobile file pickers do not actually respect `accept` and
  // will still list pictures, so a picture is rejected here explicitly
  // rather than trusted to the OS to have filtered it out. A video with no
  // audio track at all is rejected too, checked client-side before upload.
  const onAudioFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (media.length > 0) return setError("Post a sound clip on its own, not with images or video.");

    if (file.type.startsWith("image/")) {
      return setError("A picture cannot go here, only a sound clip or a video with sound.");
    }
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
      return setError("Choose a sound clip or a video with sound.");
    }
    if (file.size > MAX_AUDIO_MB * 1024 * 1024) return setError(`Keep the clip under ${MAX_AUDIO_MB}MB.`);

    if (file.type.startsWith("video/")) {
      setUploading(true);
      const audible = await videoHasAudio(file).catch(() => false);
      if (!audible) {
        setUploading(false);
        return setError("That video has no sound to pull the audio from.");
      }
    }

    await uploadAudio(file);
  };

  const uploadImages = async (files) => {
    setUploading(true);
    try {
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (file_url) setMedia((prev) => [...prev, { url: file_url, kind: "image" }]);
      }
    } catch {
      setError("That upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const uploadVideo = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (!file_url) throw new Error();
      setMedia([{ url: file_url, kind: "video" }]);
      // Capture a real thumbnail so mobile does not show a black square.
      try {
        const posterFile = await capturePoster(file);
        if (posterFile) {
          const { file_url: purl } = await base44.integrations.Core.UploadFile({ file: posterFile });
          if (purl) setMediaPoster(purl);
        }
      } catch {
        /* poster is a nicety; the #t fallback still shows a frame */
      }
    } catch {
      setError("That upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const uploadAudio = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (!file_url) throw new Error();
      setMedia([{ url: file_url, kind: "audio", name: file.name }]);
    } catch {
      setError("That upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = (i) => {
    setMedia((prev) => prev.filter((_, idx) => idx !== i));
    setMediaPoster(null);
  };

  // Poll editing
  const togglePoll = () => {
    if (poll) return setPoll(null);
    setMedia([]); // a poll carries no media
    setMediaPoster(null);
    setPoll({ options: ["", ""], hours: 24 });
  };
  const setOption = (i, val) =>
    setPoll((p) => ({ ...p, options: p.options.map((o, idx) => (idx === i ? val : o)) }));
  const addOption = () => setPoll((p) => (p.options.length >= 4 ? p : { ...p, options: [...p.options, ""] }));
  const removeOption = (i) =>
    setPoll((p) => (p.options.length <= 2 ? p : { ...p, options: p.options.filter((_, idx) => idx !== i) }));

  const pollReady = poll && poll.options.filter((o) => o.trim()).length >= 2;

  const submit = async () => {
    if (uploading) return;
    const ok = await onPost({
      media: poll ? [] : media.map((m) => m.url),
      mediaKind: poll ? undefined : media[0]?.kind,
      mediaPoster: poll ? undefined : mediaPoster,
      pollOptions: pollReady ? poll.options.map((o) => o.trim()).filter(Boolean) : null,
      pollHours: poll?.hours,
    });
    if (ok) {
      setMedia([]);
      setMediaPoster(null);
      setPoll(null);
    }
  };

  const canPost =
    !over &&
    !uploading &&
    !posting &&
    (poll ? pollReady : draft.trim().length > 0 || media.length > 0);

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-sm font-semibold text-primary">
          {me?.avatar_url ? (
            <img src={me.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            initial
          )}
        </div>

        <div className="min-w-0 flex-1">
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What news do you bring to the realm?"
            rows={1}
            className="w-full resize-none bg-transparent pt-1.5 text-lg leading-snug placeholder:text-muted-foreground/60 focus:outline-none"
          />

          {/* Media previews */}
          {media.length > 0 && (
            <div className={cn("mt-2 grid gap-1.5", media.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
              {media.map((m, i) =>
                m.kind === "audio" ? (
                  <div
                    key={i}
                    className="relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2.5"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Music2 className="h-4 w-4" />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{m.name}</span>
                    <button
                      type="button"
                      onClick={() => removeMedia(i)}
                      className="shrink-0 rounded-full p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div key={i} className="group relative overflow-hidden rounded-xl border border-border">
                    {m.kind === "video" ? (
                      <video src={m.url} className="max-h-64 w-full bg-black" muted />
                    ) : (
                      <img src={m.url} alt="" className="aspect-video w-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(i)}
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {/* Poll editor */}
          {poll && (
            <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
              {poll.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value.slice(0, 40))}
                    placeholder={`Choice ${i + 1}`}
                    maxLength={40}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background/40 px-3 text-sm focus:border-primary/60 focus:outline-none"
                  />
                  {poll.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                {poll.options.length < 4 ? (
                  <button
                    type="button"
                    onClick={addOption}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add choice
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <select
                    value={poll.hours}
                    onChange={(e) => setPoll((p) => ({ ...p, hours: Number(e.target.value) }))}
                    className="h-8 rounded-lg border border-border bg-background/40 px-2 text-xs focus:outline-none"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d.hours} value={d.hours}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={togglePoll}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Remove poll
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

          <div className="mt-2 flex items-center justify-between border-t border-border pt-2.5">
            <div className="flex items-center gap-0.5 text-primary">
              <EmojiPicker onPick={insertEmoji} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || hasExclusiveMedia || !!poll}
                title="Add images or a short video"
                className="flex h-9 w-9 items-center justify-center rounded-full text-primary transition hover:bg-primary/10 disabled:opacity-40"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={onFiles}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => audioFileRef.current?.click()}
                disabled={uploading || hasExclusiveMedia || !!poll}
                title="Add a sound clip, or a video to pull audio from"
                className="flex h-9 w-9 items-center justify-center rounded-full text-primary transition hover:bg-primary/10 disabled:opacity-40"
              >
                <Music2 className="h-5 w-5" />
              </button>
              <input
                ref={audioFileRef}
                type="file"
                accept="audio/*,video/*"
                onChange={onAudioFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={togglePoll}
                disabled={media.length > 0}
                title="Create a poll"
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-primary transition hover:bg-primary/10 disabled:opacity-40",
                  poll && "bg-primary/10"
                )}
              >
                <ListChecks className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              {draft.length > 0 && <CircleGauge value={draft.length} max={MAX} />}
              <button
                onClick={submit}
                disabled={!canPost}
                className="flex h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
              >
                {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Grab a frame from a video file and return it as a JPEG File, to use as the
 * poster. Mobile browsers show a black square for a video with no poster, so
 * this is what makes an uploaded clip look like a real post. Same-origin
 * (an object URL), so the canvas is not tainted.
 */
function capturePoster(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.src = url;

    const done = (result) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };

    v.onloadedmetadata = () => {
      // A fraction in, to avoid a black lead-in frame.
      v.currentTime = Math.min(0.5, (v.duration || 1) / 3);
    };
    v.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = v.videoWidth || 640;
        canvas.height = v.videoHeight || 360;
        canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => done(blob ? new File([blob], "poster.jpg", { type: "image/jpeg" }) : null),
          "image/jpeg",
          0.8
        );
      } catch {
        done(null);
      }
    };
    v.onerror = () => done(null);
    // Safety timeout so a stubborn file cannot hang the upload.
    setTimeout(() => done(null), 8000);
  });
}

/**
 * Whether a video file actually has an audio track, checked entirely
 * client-side (no upload, no server round-trip). Chrome/Edge/Safari expose
 * `audioTracks` right after metadata loads; when a browser does not, this
 * falls back to a brief silent, muted play so `webkitAudioDecodedByteCount`
 * (which only populates once something has actually decoded) has a chance
 * to report anything at all.
 */
function videoHasAudio(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.src = url;

    const done = (result) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const knownFromTracks = () => {
      if (typeof v.mozHasAudio === "boolean") return v.mozHasAudio;
      if (v.audioTracks) return v.audioTracks.length > 0;
      return null; // unknown yet, needs a decode nudge below
    };

    v.onloadedmetadata = () => {
      const known = knownFromTracks();
      if (known !== null) return done(known);
      v.play()
        .then(() => {
          setTimeout(() => done((v.webkitAudioDecodedByteCount || 0) > 0), 300);
        })
        .catch(() => done(false));
    };
    v.onerror = () => done(false);
    // A stubborn file should reject rather than hang the composer forever.
    setTimeout(() => done(false), 8000);
  });
}

function CircleGauge({ value, max }) {
  const r = 9;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  const remaining = max - value;
  const near = remaining <= 40;
  const over = remaining < 0;
  const stroke = over ? "hsl(var(--destructive))" : near ? "hsl(38 95% 60%)" : "hsl(var(--primary))";

  return (
    <div className="flex items-center gap-1.5">
      {near && (
        <span className={cn("tnum text-xs", over ? "text-destructive" : "text-muted-foreground")}>
          {remaining}
        </span>
      )}
      <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
        />
      </svg>
    </div>
  );
}
