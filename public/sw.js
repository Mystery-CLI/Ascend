// A minimal, deliberately inert service worker. Its only job is to exist:
// Chrome's automatic "Install app" prompt requires a registered service
// worker, but this app's live data (renown, the feed, DMs) must never be
// served stale, so nothing here intercepts a request or caches a response.
// Every fetch falls through to the network exactly as it would with no
// service worker at all.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
