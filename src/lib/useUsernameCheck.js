import { useEffect, useRef, useState } from "react";
import { realm } from "@/lib/realm";

/**
 * Debounced X-style username availability check, shared by the signup form
 * (no one signed in yet) and the crest edit form (checking a change against
 * your own current username). `currentUsername` is treated as already-yours
 * and never flagged taken.
 */
export function useUsernameCheck(username, currentUsername = "") {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null); // { available, reason } | null
  const timer = useRef(null);
  const trimmed = username.trim().toLowerCase();
  const changed = trimmed !== (currentUsername || "");

  useEffect(() => {
    clearTimeout(timer.current);
    if (!changed || !trimmed) {
      setChecking(false);
      setResult(null);
      return;
    }
    setChecking(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await realm("check_username", { username: trimmed });
        setResult(res);
      } catch {
        setResult({ available: false, reason: "Could not check right now." });
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, changed]);

  return { checking, result, changed };
}
