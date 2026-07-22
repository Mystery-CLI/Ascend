import { useRef, useState } from "react";
import { Loader2, Camera, LogOut, Mail } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { RankBadge } from "@/components/RankBadge";
import { rankMeta, climbProgress } from "@/lib/ranks";
import { notify } from "@/lib/toast";

/**
 * Your own crest: the one place a subject edits their public face (portrait,
 * name, a short line) and reaches account settings (email, logout). Renown
 * and rank are shown but never editable here, same rule as everywhere else:
 * only the server moves those numbers.
 */
export function Profile({ me, user, onUpdated, onLogout }) {
  const fileRef = useRef(null);
  const [handle, setHandle] = useState(me?.handle || "");
  const [bio, setBio] = useState(me?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(me?.avatar_url || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty =
    handle !== (me?.handle || "") || bio !== (me?.bio || "") || avatarUrl !== (me?.avatar_url || "");

  const onAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return notify("Choose a picture.");
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (file_url) setAvatarUrl(file_url);
    } catch {
      notify("That upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const trimmedHandle = handle.trim().slice(0, 24);
    if (!trimmedHandle) return notify("Your name cannot be empty.");
    setSaving(true);
    try {
      const trimmedBio = bio.trim().slice(0, 160);
      await base44.entities.Subject.update(me.id, {
        handle: trimmedHandle,
        bio: trimmedBio,
        avatar_url: avatarUrl,
      });
      onUpdated?.({ handle: trimmedHandle, bio: trimmedBio, avatar_url: avatarUrl });
      notify("Crest updated.", "success");
    } catch (err) {
      notify(err.message || "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const progress = climbProgress(me.rank, me.renown);

  return (
    <div className="px-4 py-5">
      <h2 className="mb-4 text-center font-display text-2xl font-bold text-primary">Your Crest</h2>

      <div className="flex flex-col items-center">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="group relative h-24 w-24 shrink-0"
          title="Change your portrait"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-24 w-24 rounded-full object-cover ring-2 ring-primary/40" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-secondary font-display text-3xl font-semibold text-primary ring-2 ring-primary/40">
              {(handle || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition group-hover:opacity-100">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            ) : (
              <Camera className="h-5 w-5 text-white" />
            )}
          </div>
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onAvatarFile} className="hidden" />

        <div className="mt-3">
          <RankBadge rank={me.rank} size="sm" />
        </div>

        {progress && (
          <div className="mt-3 w-full max-w-xs">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span>{rankMeta(me.rank).label}</span>
              <span>
                {progress.into}/{progress.span} to {progress.next.label}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress.pct}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-3 rounded-2xl border border-border bg-card/50 p-4">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Name</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.slice(0, 24))}
            placeholder="Your name in the realm"
            className="h-11 w-full rounded-xl border border-border bg-background/60 px-3 text-sm focus:border-primary/60 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 160))}
            rows={3}
            placeholder="A short line shown on your crest..."
            className="w-full resize-none rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm focus:border-primary/60 focus:outline-none"
          />
          <p className="mt-1 text-right text-[11px] text-muted-foreground">{bio.length}/160</p>
        </label>
        <button
          onClick={save}
          disabled={saving || uploading || !dirty}
          className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save changes"}
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card/40">
        <div className="border-b border-border px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Settings
        </div>
        <div className="flex items-center gap-2.5 px-4 py-3 text-sm text-muted-foreground">
          <Mail className="h-4 w-4 shrink-0" />
          <span className="truncate">{user?.email}</span>
        </div>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2.5 border-t border-border px-4 py-3 text-left text-sm text-destructive transition hover:bg-destructive/5"
        >
          <LogOut className="h-4 w-4" />
          Leave the realm
        </button>
      </div>
    </div>
  );
}
