const fs = require("node:fs");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

/**
 * Tools › Video downloader (SRS 37.4), direct links only: a link to a video
 * or audio file, a page that publishes its file (og:video, <video>,
 * <source>), or an HLS/DASH stream without DRM. DRM-protected streams are
 * refused with the reason (DL-03); sites behind sign-in aren't supported.
 * File downloads write to a .part file so they can pause and resume, even
 * after a restart (DL-06); streams are saved with the bundled FFmpeg.
 */
const MEDIA_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|mp3|m4a|aac|wav|ogg|opus|flac|gif)(?:$|\?)/i;
const HLS = /\.m3u8(?:$|\?)|mpegurl/i;
const DASH = /\.mpd(?:$|\?)|dash\+xml/i;
const jobs = new Map(); // jobId → { controller, paused }

function isMedia(type, url) {
	return /^(video|audio)\//i.test(type) || type === "image/gif" || MEDIA_EXT.test(url);
}

function streamKind(type, url) {
	if (HLS.test(type) || HLS.test(url)) return "hls";
	if (DASH.test(type) || DASH.test(url)) return "dash";
	return null;
}

/** The video file or stream a page points to, if it publishes one. */
function findVideoInPage(html, pageUrl) {
	const patterns = [
		/<meta[^>]+property=["']og:video(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i,
		/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url|:url)?["']/i,
		/<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i,
		/<video[^>]+src=["']([^"']+)["']/i,
		/<source[^>]+src=["']([^"']+\.(?:mp4|webm|m4v|mov|mp3|m4a|ogg|m3u8|mpd)[^"']*)["']/i,
	];
	for (const pattern of patterns) {
		const match = pattern.exec(html);
		if (match?.[1]) {
			try {
				return new URL(match[1].replace(/&amp;/g, "&"), pageUrl).href;
			} catch {
				// Not a usable address; try the next pattern.
			}
		}
	}
	return null;
}

function pageTitle(html) {
	const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1];
	const title = og ?? /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1];
	return title?.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim().slice(0, 120) || null;
}

function fileNameFor({ url, type, disposition }) {
	const fromHeader = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(disposition ?? "")?.[1];
	let name = fromHeader ? decodeURIComponent(fromHeader) : decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
	name = safeName(name);
	if (!path.extname(name)) {
		const ext = /mp4/.test(type) ? ".mp4" : /webm/.test(type) ? ".webm" : /mpeg/.test(type) ? ".mp3" : /quicktime/.test(type) ? ".mov" : ".mp4";
		name = `${name || "download"}${ext}`;
	}
	return name;
}

const safeName = (name) => String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().slice(0, 120);

/**
 * Why a stream can't be saved, or null. Widevine, PlayReady and FairPlay
 * (SAMPLE-AES with Apple key delivery) are DRM; plain AES-128 HLS isn't.
 */
function drmReason(text, kind) {
	if (kind === "dash") {
		if (/<ContentProtection/i.test(text)) return "This stream is protected with DRM (Widevine or PlayReady), so it can't be downloaded.";
		return null;
	}
	const keys = text.match(/#EXT-X-(?:SESSION-)?KEY:[^\n]*/g) ?? [];
	for (const key of keys) {
		if (/METHOD=NONE/i.test(key)) continue;
		if (/streamingkeydelivery|fairplay/i.test(key)) return "This stream is protected with FairPlay DRM, so it can't be downloaded.";
		if (/edef8ba9-79d6-4ace-a3c8-27dcd51d21ed|widevine/i.test(key)) return "This stream is protected with Widevine DRM, so it can't be downloaded.";
		if (/9a04f079-9840-4286-ab92-e65be0885f95|playready/i.test(key)) return "This stream is protected with PlayReady DRM, so it can't be downloaded.";
		if (/METHOD=SAMPLE-AES/i.test(key)) return "This stream is protected with DRM, so it can't be downloaded.";
	}
	return null;
}

/** Quality choices in an HLS master playlist. */
function hlsVariants(text, base) {
	const out = [];
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
		const uri = lines.slice(i + 1).find((l) => l.trim() && !l.startsWith("#"));
		if (!uri) continue;
		const height = Number(/RESOLUTION=\d+x(\d+)/.exec(line)?.[1] ?? 0);
		const bandwidth = Number(/BANDWIDTH=(\d+)/.exec(line)?.[1] ?? 0);
		out.push({ url: new URL(uri.trim(), base).href, height, bandwidth, label: height ? `${height}p` : `${Math.round(bandwidth / 1000)} kbps` });
	}
	return out.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
}

const hlsDuration = (text) => (text.match(/#EXTINF:([\d.]+)/g) ?? []).reduce((n, m) => n + Number(m.slice(8)), 0);

/**
 * Public share links from Google Drive, Dropbox and OneDrive turned into
 * their direct-download form (DL-02). Only links shared with "anyone with
 * the link" work; private files need the owner's sign-in, which we don't do.
 */
function resolveShareLink(url) {
	let u;
	try {
		u = new URL(String(url).trim());
	} catch {
		return { url, source: null };
	}
	const host = u.hostname.replace(/^www\./, "");
	if (host === "drive.google.com" || host === "docs.google.com") {
		const id = /\/d\/([\w-]{10,})/.exec(u.pathname)?.[1] ?? u.searchParams.get("id");
		if (id) return { url: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, source: "Google Drive" };
	}
	if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
		u.searchParams.delete("dl");
		u.searchParams.set("dl", "1");
		return { url: u.href, source: "Dropbox" };
	}
	if (host === "1drv.ms" || host === "onedrive.live.com") {
		const encoded = Buffer.from(u.href).toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
		return { url: `https://api.onedrive.com/v1.0/shares/u!${encoded}/root/content`, source: "OneDrive" };
	}
	if (host.endsWith(".sharepoint.com")) {
		u.searchParams.set("download", "1");
		return { url: u.href, source: "OneDrive" };
	}
	return { url: u.href, source: null };
}

/** Subtitle tracks a page publishes (<track src=...vtt>). */
function pageSubtitles(html, pageUrl) {
	const out = [];
	for (const m of html.matchAll(/<track\b[^>]*>/gi)) {
		const tag = m[0];
		const kind = /kind=["']([^"']+)["']/i.exec(tag)?.[1] ?? "subtitles";
		const src = /src=["']([^"']+)["']/i.exec(tag)?.[1];
		if (!src || !/subtitles|captions/i.test(kind)) continue;
		try {
			out.push({ url: new URL(src.replace(/&amp;/g, "&"), pageUrl).href, lang: /srclang=["']([^"']+)["']/i.exec(tag)?.[1] ?? "und", format: "vtt" });
		} catch {
			// Not a usable address.
		}
	}
	return out;
}

/** Subtitle renditions in an HLS master playlist. */
function hlsSubtitles(text, base) {
	const out = [];
	for (const line of text.split(/\r?\n/)) {
		if (!/^#EXT-X-MEDIA:.*TYPE=SUBTITLES/.test(line)) continue;
		const uri = /URI="([^"]+)"/.exec(line)?.[1];
		if (!uri) continue;
		out.push({ url: new URL(uri, base).href, lang: /LANGUAGE="([^"]+)"/.exec(line)?.[1] ?? /NAME="([^"]+)"/.exec(line)?.[1] ?? "und", format: "hls" });
	}
	return out;
}

/** WebVTT to SubRip (DL-04 "save subtitles as .srt"). */
function vttToSrt(vtt) {
	const blocks = String(vtt).replace(/\r/g, "").split(/\n{2,}/);
	const cues = [];
	for (const block of blocks) {
		const lines = block.split("\n");
		const at = lines.findIndex((l) => l.includes("-->"));
		if (at < 0) continue;
		const fix = (t) => {
			const parts = t.trim().split(/\s/)[0].split(":");
			if (parts.length === 2) parts.unshift("00");
			return parts.join(":").replace(".", ",");
		};
		const [from, to] = lines[at].split("-->");
		const text = lines.slice(at + 1).join("\n").replace(/<[^>]+>/g, "").trim();
		if (text) cues.push(`${cues.length + 1}\n${fix(from)} --> ${fix(to)}\n${text}`);
	}
	return cues.join("\n\n") + (cues.length ? "\n" : "");
}

/** Saves subtitles next to a downloaded video as <name>.<lang>.srt. */
async function saveSubtitles({ subtitles, videoPath, runFfmpeg, fetchImpl = fetch }) {
	const saved = [];
	const stem = videoPath.slice(0, videoPath.length - path.extname(videoPath).length);
	for (const sub of subtitles ?? []) {
		const out = `${stem}.${safeName(sub.lang || "und")}.srt`;
		try {
			if (sub.format === "hls") {
				await runFfmpeg({ args: ["-protocol_whitelist", "http,https,tcp,tls,crypto", "-i", sub.url, out] });
			} else {
				const res = await fetchImpl(parseUrl(sub.url));
				if (!res.ok) continue;
				const text = await res.text();
				await fs.promises.writeFile(out, /-->/.test(text) && !/^\s*\d+\s*\n/.test(text) ? vttToSrt(text) : text);
			}
			saved.push(out);
		} catch {
			// One missing subtitle file shouldn't fail the download.
		}
	}
	return saved;
}

function parseUrl(url) {
	let target;
	try {
		target = new URL(String(url).trim());
	} catch {
		throw new Error("That isn't a web address.");
	}
	if (!/^https?:$/.test(target.protocol)) throw new Error("Only http and https links can be downloaded.");
	return target;
}

/**
 * Checks a link before downloading (DL-01): what it is, its title, size,
 * quality choices and whether it may be downloaded.
 */
async function inspect({ url, fetchImpl = fetch }) {
	const original = parseUrl(url);
	const shared = resolveShareLink(original.href);
	const target = parseUrl(shared.url);
	const host = shared.source ?? original.hostname.replace(/^www\./, "");
	let subtitles = [];
	const head = async (u) => {
		const controller = new AbortController();
		const res = await fetchImpl(u, { signal: controller.signal, redirect: "follow", headers: { Range: "bytes=0-0" } });
		return { res, done: () => controller.abort() };
	};
	let { res, done } = await head(target);
	if (!res.ok && res.status !== 206) {
		done();
		if (res.status === 401 || res.status === 403 || (shared.source && res.status === 404))
			return { ok: false, host, reason: shared.source ? `This ${shared.source} file isn't shared publicly. Set it to "Anyone with the link" and try again.` : "This link is private or needs a sign-in, so it can't be downloaded." };
		return { ok: false, host, reason: `The site answered ${res.status}.` };
	}
	let type = res.headers.get("content-type") ?? "";
	let mediaUrl = res.url;
	let title = null;
	// A media file served as a generic download (share links): judged by the name it's saved under.
	const named = (r) => {
		const disposition = r.headers.get("content-disposition") ?? "";
		const generic = /octet-stream|binary/i.test(r.headers.get("content-type") ?? "");
		if (!/filename/i.test(disposition) && !generic) return "";
		return fileNameFor({ url: r.url, type: "", disposition });
	};
	if (shared.source && /html/i.test(type)) {
		done();
		return { ok: false, host, reason: `This ${shared.source} file isn't shared publicly, or it's a folder. Share the file with "Anyone with the link" and try again.` };
	}
	if (!isMedia(type, mediaUrl) && !streamKind(type, mediaUrl) && !MEDIA_EXT.test(named(res))) {
		if (!/html/i.test(type)) {
			done();
			return { ok: false, host, reason: "That link isn't a video or audio file." };
		}
		const html = await res.text();
		title = pageTitle(html);
		subtitles = pageSubtitles(html, res.url);
		const found = findVideoInPage(html, res.url);
		if (!found) return { ok: false, host, title, reason: "No video file on that page. Paste a link that points straight to the video file." };
		({ res, done } = await head(found));
		if (!res.ok && res.status !== 206) {
			done();
			return { ok: false, host, title, reason: `The video file answered ${res.status}.` };
		}
		type = res.headers.get("content-type") ?? "";
		mediaUrl = res.url;
	}
	const kind = streamKind(type, mediaUrl);
	if (kind) {
		const text = await res.text();
		const reason = drmReason(text, kind);
		if (reason) return { ok: false, host, title, kind, reason };
		if (kind === "dash") return { ok: true, host, kind, url: mediaUrl, title: title ?? fileStem(mediaUrl), variants: [], subtitles };
		const variants = hlsVariants(text, mediaUrl);
		subtitles = [...subtitles, ...hlsSubtitles(text, mediaUrl)];
		let duration = hlsDuration(text);
		if (!duration && variants[0]) {
			const media = await (await fetchImpl(variants[0].url)).text();
			const inner = drmReason(media, "hls");
			if (inner) return { ok: false, host, title, kind, reason: inner };
			duration = hlsDuration(media);
		}
		return { ok: true, host, kind, url: mediaUrl, title: title ?? fileStem(mediaUrl), duration: duration || undefined, variants, subtitles };
	}
	done();
	if (!isMedia(type, mediaUrl) && !MEDIA_EXT.test(named(res))) return { ok: false, host, title, reason: "The page's video link isn't a file that can be saved." };
	const range = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1];
	const bytes = Number(range ?? res.headers.get("content-length") ?? 0) || undefined;
	const name = fileNameFor({ url: mediaUrl, type, disposition: res.headers.get("content-disposition") });
	return {
		ok: true,
		host,
		kind: "file",
		// Share links can redirect to short-lived addresses: keep the stable one.
		url: shared.source ? target.href : mediaUrl,
		subtitles,
		name,
		title: title ?? name.replace(/\.[^.]+$/, ""),
		bytes,
		type,
		resumable: res.status === 206,
		audio: /^audio\//i.test(type),
		variants: [],
	};
}

const fileStem = (u) => decodeURIComponent(new URL(u).pathname.split("/").filter(Boolean).slice(-2, -1)[0] ?? "stream") || "stream";

function uniquePath(folder, name) {
	const ext = path.extname(name);
	const stem = name.slice(0, name.length - ext.length);
	let output = path.join(folder, name);
	for (let n = 2; fs.existsSync(output); n++) output = path.join(folder, `${stem} (${n})${ext}`);
	return output;
}

/** Caps throughput at `bytesPerSecond` (DL-06 speed limit); 0 = no limit. */
function throttle(bytesPerSecond) {
	const started = Date.now();
	let sent = 0;
	return new Transform({
		transform(chunk, _enc, cb) {
			sent += chunk.length;
			const wait = bytesPerSecond > 0 ? (sent / bytesPerSecond) * 1000 - (Date.now() - started) : 0;
			if (wait > 0) setTimeout(() => cb(null, chunk), wait);
			else cb(null, chunk);
		},
	});
}

/**
 * Downloads a file link into `folder`, resuming from `<folder>/.<jobId>.part`
 * when a previous run was paused. Returns the saved path.
 */
async function downloadFile({ jobId, url, folder, name, speedLimit = 0, onProgress, fetchImpl = fetch }) {
	const target = parseUrl(url);
	await fs.promises.mkdir(folder, { recursive: true });
	const part = path.join(folder, `.${safeName(jobId)}.part`);
	const job = { controller: new AbortController(), paused: false };
	jobs.set(String(jobId), job);
	try {
		let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
		let response = await fetchImpl(target, { signal: job.controller.signal, redirect: "follow", headers: have ? { Range: `bytes=${have}-` } : {} });
		if (response.status === 416 && have) {
			// Already complete on disk.
			response = null;
		} else if (!response.ok) {
			throw new Error(`The site answered ${response.status}.`);
		}
		let total = 0;
		if (response) {
			const type = response.headers.get("content-type") ?? "";
			if (!isMedia(type, response.url) && !/octet-stream|binary/i.test(type) && !MEDIA_EXT.test(fileNameFor({ url: response.url, type, disposition: response.headers.get("content-disposition") })))
				throw new Error("That link isn't a video or audio file.");
			name ??= fileNameFor({ url: response.url, type, disposition: response.headers.get("content-disposition") });
			if (response.status !== 206) have = 0; // The server ignored the range: start over.
			const range = /\/(\d+)$/.exec(response.headers.get("content-range") ?? "")?.[1];
			total = Number(range ?? 0) || (Number(response.headers.get("content-length") ?? 0) + have);
			let received = have;
			const body = Readable.fromWeb(response.body);
			body.on("data", (chunk) => {
				received += chunk.length;
				onProgress?.({ received, total });
			});
			await pipeline(body, throttle(speedLimit), fs.createWriteStream(part, { flags: have ? "a" : "w" }));
		}
		const bytes = fs.statSync(part).size;
		// Size check on finish (DL-06).
		if (total && bytes !== total) throw new Error(`The download is incomplete (${bytes} of ${total} bytes). Try again.`);
		const output = uniquePath(folder, name ?? path.basename(target.pathname) ?? "download.mp4");
		await fs.promises.rename(part, output);
		return { path: output, name: path.basename(output), bytes };
	} catch (error) {
		if (job.paused) throw Object.assign(new Error("Paused"), { code: "paused" });
		if (job.controller.signal.aborted) {
			await fs.promises.rm(part, { force: true }).catch(() => {});
			throw new Error("Cancelled");
		}
		throw error;
	} finally {
		jobs.delete(String(jobId));
	}
}

/** Saves an HLS/DASH stream with FFmpeg, optionally only a part or the sound. */
async function downloadStream({ jobId, url, folder, title, start, end, audioOnly, duration, onProgress, runFfmpeg }) {
	parseUrl(url);
	await fs.promises.mkdir(folder, { recursive: true });
	const output = uniquePath(folder, `${safeName(title || "stream")}.${audioOnly ? "m4a" : "mp4"}`);
	const span = Math.max(0, (end ?? duration ?? 0) - (start ?? 0));
	const args = [
		"-protocol_whitelist", "http,https,tcp,tls,crypto",
		...(start ? ["-ss", String(start)] : []),
		"-i", url,
		...(end ? ["-t", String(Math.max(0.1, end - (start ?? 0)))] : []),
		...(audioOnly ? ["-vn"] : []),
		"-c", "copy",
		...(audioOnly ? [] : ["-bsf:a", "aac_adtstoasc", "-movflags", "+faststart"]),
		output,
	];
	try {
		await runFfmpeg({ args, durationSeconds: span, jobId, onProgress: (p) => onProgress?.({ received: Math.round(p * 1000), total: 1000 }) });
	} catch (error) {
		await fs.promises.rm(output, { force: true }).catch(() => {});
		throw error;
	}
	const bytes = fs.statSync(output).size;
	return { path: output, name: path.basename(output), bytes };
}

/** Pause keeps the .part file so the download can resume. */
function pause(jobId) {
	const job = jobs.get(String(jobId));
	if (!job) return false;
	job.paused = true;
	job.controller.abort();
	return true;
}

function cancel(jobId) {
	jobs.get(String(jobId))?.controller.abort();
}

/** Removes the partial file of a cancelled job that was paused. */
async function discard({ jobId, folder }) {
	await fs.promises.rm(path.join(folder, `.${safeName(jobId)}.part`), { force: true }).catch(() => {});
}

module.exports = {
	inspect,
	saveSubtitles,
	downloadFile,
	downloadStream,
	pause,
	cancel,
	discard,
	_test: { resolveShareLink, pageSubtitles, hlsSubtitles, vttToSrt, findVideoInPage, fileNameFor, isMedia, drmReason, hlsVariants, hlsDuration, pageTitle, streamKind, throttle },
};
