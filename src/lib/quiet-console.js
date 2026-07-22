// Silence one specific, benign piece of console noise, and nothing else.
//
// Ascend's tavern is public, so the app runs for signed-out onlookers. On a
// public Base44 app the SDK probes the current user as it initialises (and its
// realtime socket authenticates), and both log a 401 "Authentication required
// to view users" even though anonymous reading works exactly as intended. This
// is an upstream cosmetic quirk, reported in our Base44 feedback, not a fault in
// Ascend, and there is no app-level call to remove because the probe is internal
// to the SDK.
//
// This module MUST be imported before the Base44 SDK so the filter is in place
// before that first probe fires. It matches ONLY that exact message, so every
// other error, including any real auth failure during an action, still shows.

const NOISE = "Authentication required to view users";

function mentionsNoise(arg) {
  if (typeof arg === "string") return arg.includes(NOISE);
  if (arg && typeof arg === "object") {
    return String(arg.message || arg.detail || "").includes(NOISE);
  }
  return false;
}

const original = console.error.bind(console);
console.error = (...args) => {
  if (args.some(mentionsNoise)) return;
  original(...args);
};
