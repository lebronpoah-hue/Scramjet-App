import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { WebSocketServer } from "ws";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

// Public web proxy: no need to restrict which public addresses it can reach.
wisp.options.allow_private_ips = false;
wisp.options.allow_loopback_ips = false;

const app = Fastify();

app.register(fastifyStatic, {
	root: join(process.cwd(), "public"),
});

app.setNotFoundHandler((req, reply) => {
	reply.code(404).sendFile("404.html");
});

app.addHook("onRequest", (req, reply, done) => {
	reply.header("Cross-Origin-Opener-Policy", "same-origin");
	reply.header("Cross-Origin-Embedder-Policy", "require-corp");
	done();
});

let port = parseInt(process.env.PORT || "");
if (isNaN(port)) port = 8080;

app.listen({ port, host: "0.0.0.0" }, (err, address) => {
	if (err) {
		console.error(err);
		process.exit(1);
	}
	console.log("Listening on:", address);
});

app.server.on("upgrade", (req, socket, head) => {
	if (req.url.endsWith("/wisp/")) {
		wisp.routeRequest(req, socket, head);
		return;
	}
	if (req.url.endsWith("/chat/")) {
		chatWss.handleUpgrade(req, socket, head, (ws) => chatWss.emit("connection", ws, req));
		return;
	}
	socket.end();
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	app.close();
	process.exit(0);
}

// ---- Chat ----
// Simple shared chat for the game hub. Messages persist to a local file, but that file
// is wiped whenever this server is redeployed (normal Render free-tier behavior).
const CHAT_LOG_PATH = join(process.cwd(), "chat-log.json");
const CHAT_HISTORY_LIMIT = 200; // how many past messages are kept/sent to new joiners

let chatHistory = [];
try {
	chatHistory = JSON.parse(await readFile(CHAT_LOG_PATH, "utf8"));
	if (!Array.isArray(chatHistory)) chatHistory = [];
} catch (e) {
	chatHistory = []; // no file yet, or it's unreadable -- start fresh
}

let saveQueued = false;
function queueSave() {
	if (saveQueued) return;
	saveQueued = true;
	setTimeout(async () => {
		saveQueued = false;
		try { await writeFile(CHAT_LOG_PATH, JSON.stringify(chatHistory)); } catch (e) {}
	}, 500);
}

function sanitizeName(name) {
	if (typeof name !== "string") return "Guest";
	name = name.trim().slice(0, 24);
	return name.length > 0 ? name : "Guest";
}

const chatWss = new WebSocketServer({ noServer: true });

chatWss.on("connection", (ws) => {
	ws.send(JSON.stringify({ type: "history", messages: chatHistory }));

	ws.on("message", (raw) => {
		let data;
		try { data = JSON.parse(raw.toString()); } catch (e) { return; }
		if (!data || typeof data.text !== "string") return;
		const text = data.text.trim().slice(0, 500);
		if (!text) return;

		const msg = {
			name: sanitizeName(data.name),
			text,
			at: Date.now(),
		};
		chatHistory.push(msg);
		if (chatHistory.length > CHAT_HISTORY_LIMIT) chatHistory = chatHistory.slice(-CHAT_HISTORY_LIMIT);
		queueSave();

		const payload = JSON.stringify({ type: "message", message: msg });
		for (const client of chatWss.clients) {
			if (client.readyState === 1) client.send(payload);
		}
	});
});
