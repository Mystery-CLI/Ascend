import { useState } from "react";
import { Crown, Loader2, ArrowRight, ArrowLeft, X, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { markFealty } from "@/lib/session";
import { useUsernameCheck } from "@/lib/useUsernameCheck";
import { cn } from "@/lib/utils";

// One step back from each, so a visitor deep in signup never loses what
// they already typed.
const BACK_STEP = { login: "choose", register: "choose", username: "register", verify: "username" };

/**
 * The gate to the realm. Everyone enters here, and everyone enters as a Peasant.
 *
 * The tavern can be read by anyone without swearing fealty, X-style. This gate
 * only appears the moment a visitor tries to ACT, cheer, reply, or post, so it
 * renders as a dismissible modal with a line explaining why it appeared.
 *
 * Two ways to swear fealty: a one-tap Google oath (smoothest), or an email and
 * password with a verification code. The email path walks through register ->
 * CHOOSE A USERNAME (X-style, checked live, before the account is created) ->
 * verify code -> sign in. Google skips the username step entirely (no page
 * for it to happen on mid-redirect); those subjects get one auto-minted and
 * can rename it from their crest afterward, matching how X itself treats an
 * OAuth signup.
 */
export function FealtyGate({ onAuthed, onClose, reason }) {
  const [mode, setMode] = useState("choose"); // choose | login | register | username | verify
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { checking, result: checkResult, changed: usernameEntered } = useUsernameCheck(username, "");
  const usernameReady = usernameEntered && !checking && checkResult?.available;

  const google = () => {
    // Mark the oath before we leave the page, so that when Google sends the
    // visitor back the app knows to check for their new session.
    markFealty();
    base44.auth.loginWithProvider("google", window.location.href);
  };

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err?.message || "The gate did not open. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const doLogin = () =>
    run(async () => {
      await base44.auth.loginViaEmailPassword(email.trim(), password);
      onAuthed();
    });

  const doRegister = () =>
    run(async () => {
      await base44.auth.register({ email: email.trim(), password });
      setMode("verify");
    });

  const doVerify = () =>
    run(async () => {
      await base44.auth.verifyOtp({ email: email.trim(), otpCode: otp.trim() });
      // Verified: sign them straight in with the credentials they just chose.
      await base44.auth.loginViaEmailPassword(email.trim(), password);
      onAuthed(username.trim().toLowerCase());
    });

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/30">
          <Crown className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-primary">
          Ascend
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-balance">
          {reason ||
            "Enter the realm a peasant. Rise, by wit and by favour, as far as the throne itself."}
        </p>
      </div>

      <div className="relative rounded-2xl border border-border bg-card p-5 shadow-2xl">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
          {mode === "choose" && (
            <div className="space-y-3">
              <button
                onClick={google}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-foreground transition hover:brightness-110"
              >
                Swear fealty with Google
              </button>
              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  or by letter
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <button
                onClick={() => setMode("login")}
                className="h-11 w-full rounded-xl border border-border bg-secondary/40 text-sm font-medium transition hover:bg-secondary"
              >
                Enter with email
              </button>
            </div>
          )}

          {(mode === "login" || mode === "register") && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (mode === "login") {
                  doLogin();
                } else {
                  setError("");
                  setMode("username"); // choose a name before the account exists, X-style
                }
              }}
              className="space-y-3"
            >
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@realm.com"
                autoFocus
              />
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder={mode === "register" ? "choose a password" : "your password"}
              />
              <PrimaryButton busy={busy}>
                {mode === "login" ? "Enter the realm" : "Continue"}
              </PrimaryButton>
              <p className="pt-1 text-center text-xs text-muted-foreground">
                {mode === "login" ? "New to the realm? " : "Already sworn? "}
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setMode(mode === "login" ? "register" : "login");
                  }}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {mode === "login" ? "Swear fealty" : "Enter instead"}
                </button>
              </p>
            </form>
          )}

          {mode === "username" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (usernameReady) doRegister();
              }}
              className="space-y-3"
            >
              <p className="text-sm text-muted-foreground">
                Choose the @name the realm will know you by. It's yours alone, no one else can take it.
              </p>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Username
                </span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
                    @
                  </span>
                  <input
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))
                    }
                    placeholder="username"
                    autoFocus
                    autoComplete="off"
                    className={cn(
                      "h-11 w-full rounded-xl border bg-background/60 pl-7 pr-9 text-base focus:outline-none",
                      usernameEntered && checkResult && !checkResult.available
                        ? "border-destructive/60 focus:border-destructive"
                        : "border-border focus:border-primary/60"
                    )}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameEntered &&
                      (checking ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : checkResult?.available ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : checkResult ? (
                        <X className="h-4 w-4 text-destructive" />
                      ) : null)}
                  </span>
                </div>
                {usernameEntered && checkResult?.reason && (
                  <p className="mt-1 text-[11px] text-destructive">{checkResult.reason}</p>
                )}
              </label>
              <PrimaryButton busy={busy} disabled={!usernameReady}>
                Take the oath
              </PrimaryButton>
            </form>
          )}

          {mode === "verify" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                doVerify();
              }}
              className="space-y-3"
            >
              <p className="text-sm text-muted-foreground">
                A verification code was sent to{" "}
                <span className="text-foreground">{email}</span>. Enter it to
                complete your oath.
              </p>
              <Field
                label="Code"
                type="text"
                value={otp}
                onChange={setOtp}
                placeholder="123456"
                autoFocus
              />
              <PrimaryButton busy={busy}>Confirm the oath</PrimaryButton>
              <button
                type="button"
                onClick={() => base44.auth.resendOtp(email.trim()).catch(() => {})}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Send the code again
              </button>
            </form>
          )}

          {mode !== "choose" && (
            <button
              onClick={() => {
                setError("");
                setMode(BACK_STEP[mode] || "choose");
              }}
              className="mt-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
          )}

          {error && (
            <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
    </div>
  );
}

function Field({ label, value, onChange, ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        className="h-11 w-full rounded-xl border border-border bg-background/60 px-3 text-base focus:border-primary/60 focus:outline-none"
      />
    </label>
  );
}

function PrimaryButton({ busy, disabled, children }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <>
          {children}
          <ArrowRight className="h-4 w-4" />
        </>
      )}
    </button>
  );
}
