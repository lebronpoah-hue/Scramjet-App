// Service worker for jsDelivr hosting. Lives next to games.svg; its scope is this folder.
const BASE = new URL("./", self.location.href).href;
importScripts("https://cdn.jsdelivr.net/npm/@mercuryworkshop/scramjet@1.1.0/dist/scramjet.all.js");
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const APP_PATH = new URL("app/", BASE).pathname;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function handle(event) {
  try {
    const u = new URL(event.request.url);
    // Serve the hub page as real HTML (jsDelivr would send it as text/plain)
    if (event.request.mode === "navigate" && (u.pathname === APP_PATH || u.pathname === APP_PATH.slice(0, -1))) {
      const r = await fetch(BASE + "app.html");
      return new Response(await r.text(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    await scramjet.loadConfig();
    if (scramjet.route(event)) return await scramjet.fetch(event);
  } catch (err) {
    console.error("sw error", err);
  }
  // Anything else (or any failure above): plain network request
  return fetch(event.request);
}
self.addEventListener("fetch", (event) => event.respondWith(handle(event)));
