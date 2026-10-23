#!/usr/bin/env node
/**
 * wve: command line and MCP server for Worksuite FrameFlow's local
 * automation API (SRS AU-01–AU-03). Talks newline-delimited JSON-RPC to
 * the running app over the socket named in automation.json. No
 * dependencies; runs on any Node 18+ or the app's own runtime.
 */
"use strict";

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const APP_NAME = "Worksuite FrameFlow";
const MCP_PROTOCOL = "2025-06-18";

function discoveryPath() {
	if (process.env.WVE_AUTOMATION_FILE) return process.env.WVE_AUTOMATION_FILE;
	const home = os.homedir();
	const base =
		process.platform === "win32"
			? process.env.APPDATA ?? path.join(home, "AppData", "Roaming")
			: process.platform === "darwin"
				? path.join(home, "Library", "Application Support")
				: process.env.XDG_CONFIG_HOME ?? path.join(home, ".config");
	return path.join(base, APP_NAME, "automation.json");
}

class WveError extends Error {
	constructor(message, code = 1) {
		super(message);
		this.exitCode = code;
	}
}

function connect() {
	let info;
	try {
		info = JSON.parse(fs.readFileSync(discoveryPath(), "utf8"));
	} catch {
		throw new WveError(
			`${APP_NAME} isn't accepting automation. Open the app and turn on Settings → API (looked for ${discoveryPath()}).`,
			3,
		);
	}
	return new Promise((resolve, reject) => {
		const socket = net.connect(info.socket);
		let buffer = "";
		let nextId = 1;
		const waiting = new Map();
		socket.setEncoding("utf8");
		socket.on("error", () => reject(new WveError(`Can't reach ${APP_NAME}. Is it running with the API turned on?`, 3)));
		socket.on("data", (chunk) => {
			buffer += chunk;
			let nl;
			while ((nl = buffer.indexOf("\n")) >= 0) {
				const msg = JSON.parse(buffer.slice(0, nl));
				buffer = buffer.slice(nl + 1);
				const w = waiting.get(msg.id);
				if (!w) continue;
				waiting.delete(msg.id);
				if (msg.error) w.reject(Object.assign(new WveError(msg.error.message, 2), { rpcCode: msg.error.code }));
				else w.resolve(msg.result);
			}
		});
		socket.on("close", () => {
			for (const w of waiting.values()) w.reject(new WveError(`${APP_NAME} closed the connection`, 3));
			waiting.clear();
		});
		const call = (method, params) =>
			new Promise((res, rej) => {
				const id = nextId++;
				waiting.set(id, { resolve: res, reject: rej });
				socket.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
			});
		socket.on("connect", () => {
			call("auth", { token: info.token })
				.then(() => resolve({ call, close: () => socket.end() }))
				.catch(reject);
		});
	});
}

async function rpc(method, params) {
	const client = await connect();
	try {
		return await client.call(method, params);
	} finally {
		client.close();
	}
}

// ── MCP ────────────────────────────────────────────────────────────────
const num = (description) => ({ type: "number", description });
const strP = (description) => ({ type: "string", description });
const TOOLS = [
	["app_info", "app.info", "Version of the running Worksuite FrameFlow app.", {}],
	["account_status", "account.status", "Whether the app is signed in to Worksuite Cloud, and as whom. Never returns tokens.", {}],
	["cloud_list", "cloud.list", "List the signed-in user's Worksuite Cloud projects.", {}],
	["cloud_sync", "cloud.sync", "Sync a project with Worksuite Cloud (default: the open project).", { projectId: strP("Project id") }],
	["project_list", "project.list", "List projects saved on this computer.", {}],
	["project_current", "project.current", "The project open in the editor, or null.", {}],
	[
		"project_create",
		"project.create",
		"Create a project and open it in the editor.",
		{ name: strP("Project name"), width: num("Canvas width in pixels"), height: num("Canvas height in pixels"), fps: num("Frame rate") },
	],
	["project_open", "project.open", "Open a saved project in the editor.", { id: strP("Project id") }, ["id"]],
	["project_rename", "project.rename", "Rename the open project.", { name: strP("New name") }, ["name"]],
	["media_list", "media.list", "Media in the open project.", {}],
	[
		"media_import",
		"media.import",
		"Import video, audio or image files from this computer into the open project.",
		{ paths: { type: "array", items: { type: "string" }, description: "Absolute file paths" } },
		["paths"],
	],
	["timeline_list", "timeline.list", "Tracks and clips on the open project's timeline (times in seconds).", {}],
	[
		"timeline_add_media",
		"timeline.addMedia",
		"Put a media item on the timeline. Without start it goes at the end.",
		{ mediaId: strP("Media id from media_list"), start: num("Start time in seconds"), duration: num("Length in seconds") },
		["mediaId"],
	],
	[
		"timeline_add_text",
		"timeline.addText",
		"Add a title or text clip.",
		{ text: strP("The text"), start: num("Start time in seconds"), duration: num("Length in seconds (default 3)") },
		["text"],
	],
	["playback_seek", "playback.seek", "Move the playhead.", { seconds: num("Time in seconds") }, ["seconds"]],
	[
		"export_video",
		"export.run",
		"Render the open project to a file on this computer.",
		{
			path: strP("Output file path (.mp4, .webm or .gif)"),
			quality: { type: "string", enum: ["low", "medium", "high", "very_high"] },
			width: num("Output width"),
			height: num("Output height"),
		},
		["path"],
	],
].map(([name, method, description, properties, required = []]) => ({
	name,
	method,
	description,
	inputSchema: { type: "object", properties, required, additionalProperties: false },
}));

async function mcp() {
	const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
	let client = null;
	const app = async () => {
		if (!client) {
			client = await connect();
		}
		return client;
	};
	let buffer = "";
	process.stdin.setEncoding("utf8");
	process.stdin.on("data", async (chunk) => {
		buffer += chunk;
		let nl;
		while ((nl = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, nl).trim();
			buffer = buffer.slice(nl + 1);
			if (!line) continue;
			let req;
			try {
				req = JSON.parse(line);
			} catch {
				send({ id: null, error: { code: -32700, message: "Parse error" } });
				continue;
			}
			void handle(req);
		}
	});
	process.stdin.on("end", () => {
		client?.close();
		process.exit(0);
	});

	async function handle({ id, method, params }) {
		if (id === undefined) return; // notifications
		try {
			if (method === "initialize")
				return send({
					id,
					result: {
						protocolVersion: params?.protocolVersion ?? MCP_PROTOCOL,
						capabilities: { tools: {} },
						serverInfo: { name: "worksuite-frameflow", version: "1" },
						instructions:
							"Controls the Worksuite FrameFlow video editor running on this computer: create or open a project, import media by file path, place clips and titles (times in seconds), then export_video.",
					},
				});
			if (method === "ping") return send({ id, result: {} });
			if (method === "tools/list")
				return send({ id, result: { tools: TOOLS.map(({ method: _m, ...tool }) => tool) } });
			if (method === "tools/call") {
				const tool = TOOLS.find((t) => t.name === params?.name);
				if (!tool) return send({ id, error: { code: -32602, message: `Unknown tool ${params?.name}` } });
				try {
					const result = await (await app()).call(tool.method, params?.arguments ?? {});
					return send({
						id,
						result: { content: [{ type: "text", text: JSON.stringify(result ?? null, null, 2) }], structuredContent: { result } },
					});
				} catch (error) {
					if (error.exitCode === 3) client = null;
					return send({ id, result: { isError: true, content: [{ type: "text", text: error.message }] } });
				}
			}
			send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
		} catch (error) {
			send({ id, error: { code: -32603, message: error.message } });
		}
	}
}

// ── CLI ────────────────────────────────────────────────────────────────
const HELP = `wve: control ${APP_NAME} from the command line

  wve status                      app, account and open project
  wve login | logout | whoami     Worksuite Cloud account
  wve projects                    projects on this computer
  wve cloud                       Worksuite Cloud projects
  wve new [name] [--size WxH] [--fps N]
  wve open <project-id>
  wve import <file>...            into the open project
  wve media | wve timeline
  wve add <media-id> [--start S] [--duration S]
  wve text "<text>" [--start S] [--duration S]
  wve export <out.mp4|webm|gif> [--quality low|medium|high|very_high]
  wve sync [project-id]
  wve call <method> ['<json params>']
  wve methods                     every API method
  wve mcp                         run as an MCP server (stdio) for AI agents

Turn the API on in the app: Settings → API.`;

function flags(args) {
	const out = { _: [] };
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a.startsWith("--")) out[a.slice(2)] = args[++i];
		else out._.push(a);
	}
	return out;
}

const seconds = (v) => (v === undefined ? undefined : Number(v));

async function cli(argv) {
	const [command, ...rest] = argv;
	const f = flags(rest);
	const print = (v) => console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
	switch (command) {
		case undefined:
		case "help":
		case "--help":
		case "-h":
			return print(HELP);
		case "mcp":
			return mcp();
		case "status": {
			const c = await connect();
			try {
				const [info, account, project] = await Promise.all([
					c.call("app.info"),
					c.call("account.status"),
					c.call("project.current"),
				]);
				return print({ app: info, account, project });
			} finally {
				c.close();
			}
		}
		case "whoami": {
			const a = await rpc("account.status");
			return print(a.signedIn ? `${a.name ?? ""} <${a.email ?? ""}>${a.workspace ? ` · ${a.workspace}` : ""}` : "Not signed in");
		}
		case "login":
			return print((await rpc("account.login")).message);
		case "logout":
			await rpc("account.logout");
			return print("Signed out");
		case "projects":
			return print(await rpc("project.list"));
		case "cloud":
			return print(await rpc("cloud.list"));
		case "sync":
			return print(await rpc("cloud.sync", f._[0] ? { projectId: f._[0] } : {}));
		case "new": {
			const [w, h] = (f.size ?? "").split("x").map(Number);
			return print(
				await rpc("project.create", {
					name: f._.join(" ") || undefined,
					...(w && h ? { width: w, height: h } : {}),
					...(f.fps ? { fps: Number(f.fps) } : {}),
				}),
			);
		}
		case "open":
			return print(await rpc("project.open", { id: f._[0] }));
		case "import":
			return print(await rpc("media.import", { paths: f._.map((p) => path.resolve(p)) }));
		case "media":
			return print(await rpc("media.list"));
		case "timeline":
			return print(await rpc("timeline.list"));
		case "add":
			return print(await rpc("timeline.addMedia", { mediaId: f._[0], start: seconds(f.start), duration: seconds(f.duration) }));
		case "text":
			return print(await rpc("timeline.addText", { text: f._.join(" "), start: seconds(f.start), duration: seconds(f.duration) }));
		case "export":
			return print(await rpc("export.run", { path: path.resolve(f._[0] ?? "export.mp4"), quality: f.quality }));
		case "methods":
			return print(await rpc("methods.list"));
		case "call":
			return print(await rpc(f._[0], f._[1] ? JSON.parse(f._[1]) : {}));
		default:
			throw new WveError(`Unknown command "${command}". Run wve help.`);
	}
}

if (require.main === module) {
	cli(process.argv.slice(2)).catch((error) => {
		console.error(`wve: ${error.message}`);
		process.exit(error.exitCode ?? 1);
	});
}

module.exports = { cli, connect, rpc, TOOLS, discoveryPath };
