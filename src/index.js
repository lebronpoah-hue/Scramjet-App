import { join } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

// Public web proxy: no need to restrict which public addresses it can reach.
wisp.options.allow_private_ips = false;
wisp.options.allow_loopback_ips = false;

const app = Fastify();

app.register(fastifyStatic, {
	root: join(process.cwd(), "public"),
});
app.register(fastifyStatic, {
	root: uvPath,
	prefix: "/uv/",
	decorateReply: false,
});
app.register(fastifyStatic, {
	root: epoxyPath,
	prefix: "/epoxy/",
	decorateReply: false,
});
app.register(fastifyStatic, {
	root: baremuxPath,
	prefix: "/baremux/",
	decorateReply: false,
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
	socket.end();
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	app.close();
	process.exit(0);
}
