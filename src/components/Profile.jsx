import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Camera, LogOut, Mail, Feather, Check, X as XIcon } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { realm } from "@/lib/realm";
import { RankBadge } from "@/components/RankBadge";
import { TidingCard } from "@/components/TidingCard";
import { rankMeta, climbProgress } from "@/lib/ranks";
import { notify } from "@/lib/toast";
import { uploadErrorMessage, cn } from "@/lib/utils";

/**
 * A crest page, X-style: tapping ANY handle or avatar in the realm lands here.
 * Your own crest gets an "Edit profile" button that opens the same form this
 * page used to always show; everyone else's gets a Raven button instead, so
 * viewing and messaging share one destination the way X shares one profile
 * route for "you" and "them". Renown is never shown here for anyone but you,
 * matching the rule everywhere else: only the server-authoritative reader
 * (yourself) may see your exact score.
 */
export function Profile({
  subject,
  isMe,
  me,
  user,
  onUpdated,
  onLogout,
  onMessage,
  onBack,
  myCheers,
  myReplyCheers,
  myVotes,
  onCheer,
  onReply,
  onVote,
  onChampion,
  onProclaim,
  onBounty,
  onCheerReply,
  onOpenProfile,
  busy,
}) {
  const [editing, setEditing] = useState(false);
  const target = isMe ? me : subject;
  const progress = isMe ? climbProgress(me.rank, me.renown) : null;

  // This subject's own timeline, X-style: everything they've ever posted,
  // newest first. Fetched fresh rather than filtered from the tavern's
  // capped feed, since an older tiding may have scrolled out of that window.
  const [tidings, setTidings] = useState(null);
  const [loadingTidings, setLoadingTidings] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!target?.id) return;
    setTidings(null);
    setLoadingTidings(true);
    base44.entities.Tiding.filter({ author_subject_id: target.id }, "-created_date")
      .then((rows) => {
        if (!cancelled) setTidings(rows);
      })
      .catch(() => {
        if (!cancelled) setTidings([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTidings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target?.id]);

  return (
    <div className="px-4 py-5">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="font-display text-lg font-bold text-primary">
          {isMe ? "Your Crest" : "Crest"}
        </h2>
      </div>

      {editing ? (
        <EditForm me={me} onDone={() => setEditing(false)} onUpdated={onUpdated} />
      ) : (
        <>
          <div className="flex flex-col items-center">
            {target?.avatar_url ? (
              <img
                src={target.avatar_url}
                alt=""
                className="h-24 w-24 rounded-full object-cover ring-2 ring-primary/40"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-secondary font-display text-3xl font-semibold text-primary ring-2 ring-primary/40">
                {(target?.handle || "?").charAt(0).toUpperCase()}
              </div>
            )}

            {/* Name and badge side by side, X-style. */}
            <div className="mt-3 flex items-center gap-2">
              <span className="font-display text-xl font-bold">{target?.handle}</span>
              <RankBadge rank={target?.rank} size="lg" showLabel={false} />
            </div>
            {target?.username && (
              <span className="text-sm text-muted-foreground">@{target.username}</span>
            )}

            {target?.bio && (
              <p className="mt-1.5 max-w-xs text-center text-sm text-muted-foreground">{target.bio}</p>
            )}

            {isMe && progress && (
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

            <div className="mt-4">
              {isMe ? (
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:bg-secondary/60"
                >
                  Edit profile
                </button>
              ) : (
                <button
                  onClick={() => onMessage?.(target)}
                  className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
                >
                  <Feather className="h-4 w-4" />
                  Raven
                </button>
              )}
            </div>
          </div>

          {isMe && (
            <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card/40">
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
          )}

          {/* Their timeline, X-style: every tiding this subject has posted. */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card/40">
            <div className="border-b border-border px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Tidings
            </div>
            {loadingTidings ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !tidings || tidings.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No tidings yet.</p>
            ) : (
              tidings.map((t) => (
                <TidingCard
                  key={t.id}
                  tiding={t}
                  author={target}
                  cheered={myCheers?.has(t.id)}
                  onCheer={onCheer}
                  onReply={onReply}
                  myRank={me?.rank}
                  onChampion={onChampion}
                  onProclaim={onProclaim}
                  onBounty={onBounty}
                  myVoteIndex={myVotes?.has(t.id) ? myVotes.get(t.id) : undefined}
                  onVote={onVote}
                  onOpenProfile={onOpenProfile}
                  busy={busy}
                  myReplyCheers={myReplyCheers}
                  onCheerReply={onCheerReply}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** The editable form, unchanged from the old always-shown Profile, just now
 * tucked behind "Edit profile" instead of being the whole page. */
function EditForm({ me, onDone, onUpdated }) {
  const fileRef = useRef(null);
  const [handle, setHandle] = useState(me?.handle || "");
  const [bio, setBio] = useState(me?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(me?.avatar_url || "");
  const [username, setUsername] = useState(me?.username || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Live availability check, X-style: debounced, only fires when the
  // username actually differs from what's already yours.
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null); // { available, reason } | null
  const checkTimer = useRef(null);
  const usernameChanged = username.trim().toLowerCase() !== (me?.username || "");

  useEffect(() => {
    clearTimeout(checkTimer.current);
    if (!usernameChanged) {
      setChecking(false);
      setCheckResult(null);
      return;
    }
    setChecking(true);
    checkTimer.current = setTimeout(async () => {
      try {
        const res = await realm("check_username", { username: username.trim().toLowerCase() });
        setCheckResult(res);
      } catch {
        setCheckResult({ available: false, reason: "Could not check right now." });
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => clearTimeout(checkTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const dirty =
    handle !== (me?.handle || "") ||
    bio !== (me?.bio || "") ||
    avatarUrl !== (me?.avatar_url || "") ||
    usernameChanged;
  const usernameBlocksSave = usernameChanged && (checking || !checkResult?.available);

  const onAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return notify("Choose a picture.");
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (file_url) setAvatarUrl(file_url);
    } catch (err) {
      notify(uploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const trimmedHandle = handle.trim().slice(0, 24);
    if (!trimmedHandle) return notify("Your name cannot be empty.");
    const trimmedUsername = username.trim().toLowerCase();
    if (usernameBlocksSave) return notify("Choose an available username first.");
    setSaving(true);
    try {
      if (usernameChanged) {
        await realm("set_username", { username: trimmedUsername });
      }
      const trimmedBio = bio.trim().slice(0, 160);
      await base44.entities.Subject.update(me.id, {
        handle: trimmedHandle,
        bio: trimmedBio,
        avatar_url: avatarUrl,
      });
      onUpdated?.({ handle: trimmedHandle, bio: trimmedBio, avatar_url: avatarUrl, username: trimmedUsername });
      notify("Crest updated.", "success");
      onDone();
    } catch (err) {
      notify(err.message || "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
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
          <span className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Username
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              @
            </span>
            <input
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))
              }
              placeholder="username"
              className={cn(
                "h-11 w-full rounded-xl border bg-background/60 pl-7 pr-9 text-sm focus:outline-none",
                usernameChanged && checkResult && !checkResult.available
                  ? "border-destructive/60 focus:border-destructive"
                  : "border-border focus:border-primary/60"
              )}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {usernameChanged &&
                (checking ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : checkResult?.available ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : checkResult ? (
                  <XIcon className="h-4 w-4 text-destructive" />
                ) : null)}
            </span>
          </div>
          {usernameChanged && checkResult?.reason && (
            <p className="mt-1 text-[11px] text-destructive">{checkResult.reason}</p>
          )}
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
        <div className="flex gap-2">
          <button
            onClick={onDone}
            className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold transition hover:bg-secondary/60"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || uploading || !dirty || usernameBlocksSave}
            className="h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
