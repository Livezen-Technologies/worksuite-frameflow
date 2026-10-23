// Downloads an LGPL-only FFmpeg build for the native helper (proxies,
// SRS PS-12–PS-16) into vendor/ffmpeg/<platform>-<arch>/, which
// electron-builder ships as resources/ffmpeg. Refuses any build that
// enables GPL or non-free code.
//
//   node scripts/fetch-ffmpeg.mjs                 this machine
//   node scripts/fetch-ffmpeg.mjs win32-x64       another target
//
// macOS has no LGPL build from the same source: set FFMPEG_DARWIN_URL to
// a .zip or .tar.* of an LGPL ffmpeg for macOS, or proxies stay off there.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BTBN = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest";
const SOURCES = {
	"linux-x64": `${BTBN}/ffmpeg-master-latest-linux64-lgpl.tar.xz`,
	"linux-arm64": `${BTBN}/ffmpeg-master-latest-linuxarm64-lgpl.tar.xz`,
	"win32-x64": `${BTBN}/ffmpeg-master-latest-win64-lgpl.zip`,
	"darwin-x64": process.env.FFMPEG_DARWIN_URL,
	"darwin-arm64": process.env.FFMPEG_DARWIN_ARM64_URL ?? process.env.FFMPEG_DARWIN_URL,
};

const target = process.argv[2] ?? `${process.platform}-${process.arch}`;
const url = SOURCES[target];
const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "vendor", "ffmpeg", target);
const exe = target.startsWith("win32") ? "ffmpeg.exe" : "ffmpeg";

if (!url) {
	console.warn(`fetch-ffmpeg: no LGPL FFmpeg source for ${target}; proxies will be unavailable in that build.`);
	process.exit(0);
}
if (fs.existsSync(path.join(outDir, exe)) && !process.env.FFMPEG_REFRESH) {
	console.log(`fetch-ffmpeg: ${target} already present (set FFMPEG_REFRESH=1 to update)`);
	process.exit(0);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "ffmpeg-"));
const archive = path.join(work, path.basename(new URL(url).pathname));
console.log(`fetch-ffmpeg: downloading ${url}`);
const res = await fetch(url);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));

const extract = path.join(work, "x");
fs.mkdirSync(extract);
if (archive.endsWith(".zip") && process.platform !== "win32") execFileSync("unzip", ["-q", archive, "-d", extract]);
else execFileSync("tar", ["-xf", archive, "-C", extract]);

const find = (dir, name) => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			const hit = find(full, name);
			if (hit) return hit;
		} else if (entry.name === name) return full;
	}
	return null;
};
const binary = find(extract, exe);
if (!binary) throw new Error(`${exe} not found in the archive`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(binary, path.join(outDir, exe));
fs.chmodSync(path.join(outDir, exe), 0o755);
const license = find(extract, "LICENSE.txt") ?? find(extract, "LICENSE");
if (license) fs.copyFileSync(license, path.join(outDir, "FFMPEG-LICENSE.txt"));

// Only check the build when it can run here.
if (target === `${process.platform}-${process.arch}`) {
	const conf = execFileSync(path.join(outDir, exe), ["-hide_banner", "-buildconf"], { encoding: "utf8" });
	if (/--enable-(gpl|nonfree)\b/.test(conf)) {
		fs.rmSync(outDir, { recursive: true, force: true });
		throw new Error("This FFmpeg build enables GPL or non-free code; refusing to ship it.");
	}
	fs.writeFileSync(path.join(outDir, "BUILD.txt"), `${url}\n\n${conf}`);
}
fs.rmSync(work, { recursive: true, force: true });
console.log(`fetch-ffmpeg: ${target} ready in ${path.relative(root, outDir)}`);
