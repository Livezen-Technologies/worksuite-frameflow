const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

/**
 * Tools › Video downloader, direct links only: a link to a video or audio
 * file is saved as is; a web page is read for the video file it publishes
 * (og:video, <video> or <source> tags). Sites that hide their files behind
 * players or sign-in aren't supported, by design.
 */
const MEDIA_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|mp3|m4a|aac|wav|ogg|opus|flac|gif)(?:$|\?)/i;
const jobs = new Map(); // jobId → AbortController

function isMedia(type, url) {
	return /^(video|audio)\//i.test(type) || type === "image/gif" || MEDIA_EXT.test(url);
}

/** The video file a page points to, if it publishes one. */
function findVideoInPage(html, pageUrl) {
	const patterns = [
		/<meta[^>]+property=["']og:video(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i,
		/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url|:url)?["']/i,
		/<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i,
		/<video[^>]+src=["']([^"']+)["']/i,
		/<source[^>]+src=["']([^"']+\.(?:mp4|webm|m4v|mov|mp3|m4a|ogg)[^"']*)["']/i,
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

function fileNameFor({ url, type, disposition }) {
	const fromHeader = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(disposition ?? "")?.[1];
	let name = fromHeader ? decodeURIComponent(fromHeader) : decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
	name = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120);
	if (!path.extname(name)) {
		const ext = /mp4/.test(type) ? ".mp4" : /webm/.test(type) ? ".webm" : /mpeg/.test(type) ? ".mp3" : /quicktime/.test(type) ? ".mov" : ".mp4";
		name = `${name || "download"}${ext}`;
	}
	return name;
}

async function download({ jobId, url, folder, onProgress }) {
	let target;
	try {
		target = new URL(String(url));
	} catch {
		throw new Error("That isn't a web address.");
	}
	if (!/^https?:$/.test(target.protocol)) throw new Error("Only http and https links can be downloaded.");
	const controller = new AbortController();
	jobs.set(String(jobId), controller);
	try {
		let response = await fetch(target, { signal: controller.signal, redirect: "follow" });
		if (!response.ok) throw new Error(`The site answered ${response.status}.`);
		let type = response.headers.get("content-type") ?? "";
		if (!isMedia(type, response.url)) {
			if (!/html/i.test(type)) throw new Error("That link isn't a video or audio file.");
			const found = findVideoInPage(await response.text(), response.url);
			if (!found) throw new Error("No video file on that page. Paste a link that points straight to the video file.");
			response = await fetch(found, { signal: controller.signal, redirect: "follow" });
			if (!response.ok) throw new Error(`The video file answered ${response.status}.`);
			type = response.headers.get("content-type") ?? "";
			if (!isMedia(type, response.url)) throw new Error("The page's video link isn't a file that can be saved.");
		}
		await fs.promises.mkdir(folder, { recursive: true });
		const name = fileNameFor({ url: response.url, type, disposition: response.headers.get("content-disposition") });
		const ext = path.extname(name);
		const stem = name.slice(0, name.length - ext.length);
		let output = path.join(folder, name);
		for (let n = 2; fs.existsSync(output); n++) output = path.join(folder, `${stem} (${n})${ext}`);
		const total = Number(response.headers.get("content-length") ?? 0);
		let received = 0;
		const body = Readable.fromWeb(response.body);
		body.on("data", (chunk) => {
			received += chunk.length;
			onProgress?.({ received, total });
		});
		try {
			await pipeline(body, fs.createWriteStream(output));
		} catch (error) {
			await fs.promises.rm(output, { force: true }).catch(() => {});
			throw error;
		}
		return { path: output, name: path.basename(output), bytes: received };
	} catch (error) {
		if (controller.signal.aborted) throw new Error("Cancelled");
		throw error;
	} finally {
		jobs.delete(String(jobId));
	}
}

function cancel(jobId) {
	jobs.get(String(jobId))?.abort();
}

module.exports = { download, cancel, _test: { findVideoInPage, fileNameFor, isMedia } };
