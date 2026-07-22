// A tiny local marker of "this device has sworn fealty before".
//
// The tavern is public, so most visitors are anonymous and must never trigger
// an auth check, because a signed-out probe of the current user 401s and
// clutters the console on a public Base44 app. We only ask the server "who are
// you?" when this flag says a session should exist. It is set the moment a
// visitor begins any sign-in (including before a Google redirect leaves the
// page) and cleared on logout or when a stale session is found to be gone.

const KEY = "ascend_fealty";

export function markFealty() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable; auth will simply be re-checked less efficiently */
  }
}

export function clearFealty() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function hasFealty() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
