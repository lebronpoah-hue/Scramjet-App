// Service worker for jsDelivr hosting. Lives next to games.svg; its scope is this folder.
const BASE = new URL("./", self.location.href).href;
importScripts("https://cdn.jsdelivr.net/npm/@mercuryworkshop/scramjet@1.1.0/dist/scramjet.all.js");
// Created lazily: its constructor opens the "$scramjet" database, which the page must create first
let scramjet = null;
function getScramjet() {
  if (!scramjet) {
    const { ScramjetServiceWorker } = $scramjetLoadWorker();
    scramjet = new ScramjetServiceWorker({
      files: { wasm: BASE + "scram/scramjet.wasm.wasm", all: BASE + "scram/scramjet.all.js", sync: BASE + "scram/scramjet.sync.js" },
      flags: { naiiveRewriter: true },
    });
  }
  return scramjet;
}

const APP_PATH = new URL("app/", BASE).pathname;
const PREFIX_PATH = new URL("scramjet/", BASE).pathname;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function handle(event) {
  try {
    const u = new URL(event.request.url);
    // Serve the hub page as real HTML (jsDelivr would send it as text/plain)
    if (event.request.mode === "navigate" && (u.pathname === APP_PATH || u.pathname === APP_PATH.slice(0, -1))) {
      const r = await fetch(BASE + "app30.html");
      return new Response(await r.text(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    // Only touch Scramjet's database for proxied URLs, so the page can create it first
    if (u.pathname.startsWith(PREFIX_PATH)) {
      const sj = getScramjet();
      await sj.loadConfig();
      if (sj.route(event)) return await sj.fetch(event);
    }
  } catch (err) {
    console.error("sw error", err);
  }
  // Anything else (or any failure above): plain network request
  return fetch(event.request);
}
self.addEventListener("fetch", (event) => event.respondWith(handle(event)));
