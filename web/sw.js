// Minimal service worker — exists only to make GhostShrinkr installable
// as a PWA. We deliberately do NOT cache anything: every request goes
// straight to the network, exactly as if no worker were registered.
//
// Chrome's install prompt criteria require a registered service worker
// with a fetch event listener. This file satisfies that requirement
// without introducing offline caching (and its attendant "stale app"
// problems on updates).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Empty fetch handler — we don't call event.respondWith(), so the
// browser falls back to its default network behavior.
self.addEventListener("fetch", () => {});
