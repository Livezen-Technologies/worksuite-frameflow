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
	const target = parseUrl(url);
	const host = target.hostname.replace(/^www\./, "");
	const head = async (u) => {
		const controller = new AbortController();
		const res = await fetchImpl(u, { signal: controller.signal, redirect: "follow", headers: { Range: "bytes=0-0" } });
		return { res, done: () => controller.abort() };
	};
	let { res, done } = await head(target);
	if (!res.ok && res.status !== 206) {
		done();
		if (res.status === 401 || res.status === 403) return { ok: false, host, reason: "This link is private or needs a sign-in, so it can't be downloaded." };
		return { ok: false, host, reason: `The site answered ${res.status}.` };
	}
	let type = res.headers.get("content-type") ?? "";
	let mediaUrl = res.url;
	let title = null;
	if (!isMedia(type, mediaUrl) && !streamKind(type, mediaUrl)) {
		if (!/html/i.test(type)) {
			done();
			return { ok: false, host, reason: "That link isn't a video or audio file." };
		}
		const html = await res.text();
		title = pageTitle(html);
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
		if (kind === "dash") return { ok: true, host, kind, url: mediaUrl, title: title ?? fileStem(mediaUrl), variants: [] };
		const variants = hlsVariants(text, mediaUrl);
		let duration = hlsDuration(text);
		if (!duration && variants[0]) {
			const media = await (await fetchImpl(variants[0].url)).text();
			const inner = drmReason(media, "hls");
			if (inner) return { ok: false, host, title, kind, reason: inner };
			duration = hlsDuration(media);
		}
		return { ok: true, host, kind, url: mediaUrl, title: title ?? fileStem(mediaUrl), duration: duration || undefined, variants };
	}
	done();
	if (!isMedia(type, mediaUrl)) return { ok: false, host, title, reason: "The page's video link isn't a file that can be saved." };
	const range = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1];
	const bytes = Number(range ?? res.headers.get("content-length") ?? 0) || undefined;
	const name = fileNameFor({ url: mediaUrl, type, disposition: res.headers.get("content-disposition") });
	return {
		ok: true,
		host,
		kind: "file",
		url: mediaUrl,
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
			if (!isMedia(type, response.url) && !/octet-stream/i.test(type)) throw new Error("That link isn't a video or audio file.");
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
	downloadFile,
	downloadStream,
	pause,
	cancel,
	discard,
	_test: { findVideoInPage, fileNameFor, isMedia, drmReason, hlsVariants, hlsDuration, pageTitle, streamKind, throttle },
};
