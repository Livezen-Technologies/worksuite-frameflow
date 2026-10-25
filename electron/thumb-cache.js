// Disk cache for Asset Library thumbnails and previews. The page asks for
// ffthumb://img/?u=<url>; the first time it downloads the picture, after
// that it comes straight from disk, so scrolling thousands of packs stays
// fast and works offline. Only http(s) pictures are fetched.
const { app, net, protocol } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SCHEME = "ffthumb";
const MAX_BYTES = 400 * 1024 * 1024;
const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".avif": "image/avif" };

const dir = () => path.join(app.getPath("userData"), "thumb-cache");
const inflight = new Map();

/** Must run before the app is ready. */
function registerScheme() {
	protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
}

async function download(url, file) {
	const res = await net.fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const type = res.headers.get("content-type") ?? "";
	if (!/^image\//.test(type)) throw new Error("not an image");
	const bytes = Buffer.from(await res.arrayBuffer());
	await fs.promises.mkdir(dir(), { recursive: true });
	await fs.promises.writeFile(`${file}.part`, bytes);
	await fs.promises.rename(`${file}.part`, file);
	await fs.promises.writeFile(`${file}.type`, type);
	return { bytes, type };
}

async function serve(request) {
	const url = new URL(request.url).searchParams.get("u") ?? "";
	if (!/^https?:\/\//i.test(url)) return new Response("bad url", { status: 400 });
	const file = path.join(dir(), crypto.createHash("sha1").update(url).digest("hex"));
	try {
		const bytes = await fs.promises.readFile(file);
		const type = await fs.promises.readFile(`${file}.type`, "utf8").catch(() => TYPES[path.extname(new URL(url).pathname).toLowerCase()] ?? "image/png");
		return new Response(bytes, { headers: { "content-type": type, "cache-control": "max-age=31536000, immutable", "access-control-allow-origin": "*" } });
	} catch {
		// Not cached yet: one download per picture, however many cards ask.
	}
	let job = inflight.get(file);
	if (!job) {
		job = download(url, file).finally(() => inflight.delete(file));
		inflight.set(file, job);
	}
	try {
		const { bytes, type } = await job;
		return new Response(bytes, { headers: { "content-type": type, "cache-control": "max-age=31536000, immutable", "access-control-allow-origin": "*" } });
	} catch (error) {
		return new Response(String(error?.message ?? error), { status: 502 });
	}
}

/** Drops the oldest pictures once the cache passes its size limit. */
async function prune() {
	try {
		const names = (await fs.promises.readdir(dir())).filter((n) => !n.includes("."));
		const files = await Promise.all(
			names.map(async (n) => {
				const s = await fs.promises.stat(path.join(dir(), n));
				return { n, size: s.size, at: s.atimeMs || s.mtimeMs };
			}),
		);
		let total = files.reduce((sum, f) => sum + f.size, 0);
		for (const f of files.sort((a, b) => a.at - b.at)) {
			if (total <= MAX_BYTES * 0.8) break;
			await fs.promises.rm(path.join(dir(), f.n), { force: true });
			await fs.promises.rm(path.join(dir(), `${f.n}.type`), { force: true });
			total -= f.size;
		}
	} catch {
		// No cache yet.
	}
}

function setup() {
	protocol.handle(SCHEME, serve);
	setTimeout(() => void prune(), 30_000);
}

module.exports = { registerScheme, setup, SCHEME };
