// Service worker for jsDelivr hosting. Lives next to study22.svg; its scope is this folder.
const BASE = new URL("./", self.location.href).href;

// ONE source for Scramjet: the local copy in scram/ (Scramjet 1.1.0).
// The worker, the page and the proxied pages all use this same file, so they can't drift apart.
const SCRAM = {
  version: "1.1.0",
  all: BASE + "scram/scramjet.all.js",
  sync: BASE + "scram/scramjet.sync.js",
  wasm: BASE + "scram/scramjet.wasm.wasm",
};
importScripts(SCRAM.all);

// Created lazily: its constructor opens the "$scramjet" database, which the page must create first
let scramjet = null;
function getScramjet() {
  if (!scramjet) {
    const { ScramjetServiceWorker } = $scramjetLoadWorker();
    scramjet = new ScramjetServiceWorker({
      files: { wasm: SCRAM.wasm, all: SCRAM.all, sync: SCRAM.sync },
    });
  }
  return scramjet;
}

const APP_PATH = new URL("app/", BASE).pathname;
const PREFIX_PATH = new URL("scramjet/", BASE).pathname;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function errorPage(title, detail, url, status = 502) {
  const body =
    `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<body style="font:14px system-ui;background:#050505;color:#f5f5f7;padding:2rem">` +
    `<h2 style="color:#00e5ff">${esc(title)}</h2>` +
    `<p>${esc(detail)}</p>` +
    (url ? `<p style="opacity:.6;word-break:break-all">${esc(url)}</p>` : "") +
    `<p style="opacity:.6">Try reloading. If it keeps happening, open the console for "[sw22]" messages.</p></body>`;
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

async function handle(event) {
  const req = event.request;
  const u = new URL(req.url);

  // Serve the hub page as real HTML (jsDelivr would send it as text/plain)
  if (req.mode === "navigate" && (u.pathname === APP_PATH || u.pathname === APP_PATH.slice(0, -1))) {
    try {
      const r = await fetch(BASE + "app22.html");
      if (!r.ok) throw new Error("HTTP " + r.status + " loading app22.html");
      return new Response(await r.text(), { headers: { "content-type": "text/html; charset=utf-8" } });
    } catch (err) {
      console.error("[sw22] hub page failed:", err);
      return errorPage("Could not load the page", String((err && err.message) || err), req.url);
    }
  }

  // Proxied URLs. Only touch Scramjet's database here, so the page can create it first.
  if (u.pathname.startsWith(PREFIX_PATH)) {
    try {
      const sj = getScramjet();
      await sj.loadConfig();
      if (sj.route(event)) return await sj.fetch(event);
    } catch (err) {
      // Do NOT fall back to a plain fetch here: that would just request the /scramjet/... path
      // from the host and return a confusing 404. Show the real error instead.
      console.error("[sw22] proxy failed for", req.url, err);
      return errorPage("Proxy error", String((err && err.stack) || (err && err.message) || err), req.url);
    }
  }

  // Everything else: plain network request (a network failure surfaces normally)
  return fetch(req);
}

self.addEventListener("fetch", (event) => event.respondWith(handle(event)));
