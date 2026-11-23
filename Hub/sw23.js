// Service worker for jsDelivr hosting. Scramjet v2.1.0, rebuilt from source --
// controller.sw.js is self-contained (its wasm rewriter is inlined), so unlike the
// old v1 setup, nothing here needs a separate "scram" folder or wasm file path.
const BASE = new URL("./", self.location.href).href;
importScripts(BASE + "controller.sw.js");

const APP_PATH = new URL("app/", BASE).pathname;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function handle(event) {
  try {
    const u = new URL(event.request.url);
    // Serve the hub page as real HTML (jsDelivr would send it as text/plain)
    if (event.request.mode === "navigate" && (u.pathname === APP_PATH || u.pathname === APP_PATH.slice(0, -1))) {
      const r = await fetch(BASE + "app23.html");
      return new Response(await r.text(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if ($scramjetController.shouldRoute(event)) {
      return await $scramjetController.route(event);
    }
  } catch (err) {
    console.error("sw error", err);
  }
  return fetch(event.request);
}
self.addEventListener("fetch", (event) => event.respondWith(handle(event)));
        
