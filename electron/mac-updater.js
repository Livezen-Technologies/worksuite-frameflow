// In-app updates on macOS without a Developer ID. Squirrel.Mac (electron-
// updater's Mac path) only accepts Developer ID-signed apps, so for our
// ad-hoc builds we do it ourselves: download the zip that latest-mac.yml
// names, check its sha512, unpack it with ditto, and on restart swap the
// .app bundle with a small script that runs after FrameFlow quits.
const { app, net } = require("electron");
const { spawn, execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/** The running .app bundle, e.g. /Applications/Worksuite FrameFlow.app. */
function bundlePath() {
	const marker = ".app/Contents/MacOS/";
	const i = process.execPath.indexOf(marker);
	return i < 0 ? null : process.execPath.slice(0, i + 4);
}

/** True when this copy can be replaced in place (not on the DMG, folder writable). */
function canUpdate() {
	if (process.platform !== "darwin" || !app.isPackaged) return false;
	const bundle = bundlePath();
	if (!bundle || bundle.startsWith("/Volumes/")) return false;
	try {
		fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
		fs.accessSync(bundle, fs.constants.W_OK);
		return true;
	} catch {
		return false;
	}
}

/** The zip for this Mac's chip from latest-mac.yml's files list. */
function pickZip(yml) {
	const files = [...yml.matchAll(/-\s+url:\s*['"]?([^'"\n]+?)['"]?\s*\n\s+sha512:\s*['"]?([^'"\n]+?)['"]?\s*\n\s+size:\s*(\d+)/g)].map((m) => ({
		url: m[1].trim(),
		sha512: m[2].trim(),
		size: Number(m[3]),
	}));
	const zips = files.filter((f) => f.url.endsWith(".zip"));
	const arm = process.arch === "arm64";
	return zips.find((f) => /arm64/.test(f.url) === arm) ?? zips[0] ?? null;
}

const run = (cmd, args) =>
	new Promise((resolve, reject) => execFile(cmd, args, (error) => (error ? reject(error) : resolve())));

let staged = null;

/**
 * Downloads and unpacks the update. `feedBase` is the channel folder the yml
 * came from; `onProgress` gets 0–1.
 */
async function prepare({ feedBase, yml, onProgress }) {
	const file = pickZip(yml);
	if (!file) throw new Error("This update has no Mac zip.");
	const url = /^https?:/.test(file.url) ? file.url : `${feedBase}/${encodeURI(file.url)}`;
	const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "frameflow-update-"));
	const zip = path.join(dir, "update.zip");
	const res = await net.fetch(url);
	if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
	const hash = crypto.createHash("sha512");
	const out = fs.createWriteStream(zip);
	let got = 0;
	for await (const chunk of res.body) {
		hash.update(chunk);
		got += chunk.length;
		if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
		if (file.size) onProgress?.(Math.min(0.99, got / file.size));
	}
	await new Promise((resolve, reject) => out.end((error) => (error ? reject(error) : resolve())));
	if (hash.digest("base64") !== file.sha512) throw new Error("The update didn't pass its checksum. Try again.");
	const unpacked = path.join(dir, "app");
	await run("/usr/bin/ditto", ["-x", "-k", zip, unpacked]);
	const name = (await fs.promises.readdir(unpacked)).find((n) => n.endsWith(".app"));
	if (!name) throw new Error("The update zip has no app inside.");
	const next = path.join(unpacked, name);
	await run("/usr/bin/xattr", ["-cr", next]).catch(() => {});
	staged = { dir, next };
	onProgress?.(1);
	return staged;
}

/** Quits, swaps the bundle once FrameFlow has exited, and opens the new version. */
function installAndRestart() {
	const bundle = bundlePath();
	if (!staged || !bundle) return false;
	const script = path.join(staged.dir, "swap.sh");
	fs.writeFileSync(
		script,
		[
			"#!/bin/sh",
			`while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
			`OLD=${JSON.stringify(bundle)}`,
			`NEW=${JSON.stringify(staged.next)}`,
			'BAK="$OLD.previous"',
			'rm -rf "$BAK"',
			'mv "$OLD" "$BAK" && mv "$NEW" "$OLD" && rm -rf "$BAK" || { [ -d "$BAK" ] && [ ! -d "$OLD" ] && mv "$BAK" "$OLD"; }',
			'open "$OLD"',
		].join("\n"),
		{ mode: 0o755 },
	);
	spawn("/bin/sh", [script], { detached: true, stdio: "ignore" }).unref();
	app.quit();
	return true;
}

module.exports = { canUpdate, prepare, installAndRestart };
