// Uploads an exported video to Worksuite Cloud and creates a share link
// (SRS CL-06, API in section 5.2). Runs in the main process so tokens never
// reach the page. Uploads are chunked and resumable: finished parts are
// recorded on disk, so a retry or a relaunch carries on where it stopped.
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const account = require("./account");

const PART_RETRIES = 3;
const stateFile = () => path.join(app.getPath("userData"), "uploads.json");

class CloudError extends Error {
	constructor(message, { code, status } = {}) {
		super(message);
		this.code = code;
		this.status = status;
	}
}

function readUploads() {
	try {
		return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
	} catch {
		return {};
	}
}

function writeUploads(uploads) {
	fs.writeFileSync(stateFile(), JSON.stringify(uploads), { mode: 0o600 });
}

/** Same file, same size, same modified time → same upload to resume. */
function uploadKey(filePath, stat) {
	return `${filePath}|${stat.size}|${Math.round(stat.mtimeMs)}`;
}

/** Turns an RFC 9457 problem+json (or any error response) into a message. */
async function problem(res) {
	let body = null;
	try {
		body = await res.json();
	} catch {}
	const type = String(body?.type ?? "");
	if (res.status === 401) {
		return new CloudError("Your Worksuite session has expired. Sign in again.", { code: "auth", status: 401 });
	}
	if (res.status === 413 || res.status === 507 || /quota/i.test(type)) {
		return new CloudError(
			body?.detail || "Your Worksuite Cloud storage is full. Free up space or upgrade your plan.",
			{ code: "quota", status: res.status },
		);
	}
	return new CloudError(body?.detail || body?.title || `Worksuite Cloud returned ${res.status}`, {
		code: "http",
		status: res.status,
	});
}

async function api(method, route, { body, signal } = {}) {
	const token = await account.getAccessToken();
	if (!token) throw new CloudError("Sign in to Worksuite to upload.", { code: "auth" });
	const res = await fetch(`${account.apiBase}${route}`, {
		method,
		signal,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/json",
			...(body ? { "Content-Type": "application/json" } : {}),
			...account.workspaceHeaders(),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) throw await problem(res);
	return res.status === 204 ? {} : res.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function putPart({ upload, n, chunk, signal }) {
	const presigned = upload.partUrls?.[n - 1];
	for (let attempt = 1; ; attempt++) {
		try {
			if (presigned) {
				const res = await fetch(presigned, { method: "PUT", body: chunk, signal });
				if (!res.ok) throw await problem(res);
				return;
			}
			const token = await account.getAccessToken();
			if (!token) throw new CloudError("Sign in to Worksuite to upload.", { code: "auth" });
			const res = await fetch(`${account.apiBase}/v1/uploads/${encodeURIComponent(upload.id)}/parts/${n}`, {
				method: "PUT",
				signal,
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/octet-stream",
					...account.workspaceHeaders(),
				},
				body: chunk,
			});
			if (!res.ok) throw await problem(res);
			return;
		} catch (error) {
			const fatal = signal?.aborted || error.code === "auth" || error.code === "quota" || (error.status >= 400 && error.status < 500);
			if (fatal || attempt >= PART_RETRIES) throw error;
			await sleep(1000 * 2 ** (attempt - 1));
		}
	}
}

let active = null;

/**
 * Uploads `filePath` and returns `{ url, expiresAt, assetId }`.
 * `onProgress({ phase, progress })` reports 0–1 for the upload.
 */
async function uploadAndShare({ filePath, expiresInDays, allowDownload, onProgress }) {
	if (active) throw new CloudError("An upload is already running.", { code: "busy" });
	const controller = new AbortController();
	active = controller;
	const { signal } = controller;
	try {
		const stat = await fs.promises.stat(filePath);
		const key = uploadKey(filePath, stat);
		const uploads = readUploads();
		let upload = uploads[key];

		if (!upload) {
			const started = await api("POST", "/v1/uploads", {
				signal,
				body: {
					filename: path.basename(filePath),
					size: stat.size,
					content_type: filePath.endsWith(".webm") ? "video/webm" : "video/mp4",
					purpose: "export",
				},
			});
			upload = {
				id: String(started.id ?? started.upload_id),
				chunkSize: Number(started.chunk_size) || 8 * 1024 * 1024,
				partUrls: Array.isArray(started.part_urls) ? started.part_urls : null,
				done: [],
			};
			uploads[key] = upload;
			writeUploads(uploads);
		}

		const partCount = Math.max(1, Math.ceil(stat.size / upload.chunkSize));
		const handle = await fs.promises.open(filePath, "r");
		try {
			for (let n = 1; n <= partCount; n++) {
				if (upload.done.includes(n)) continue;
				if (signal.aborted) throw new CloudError("Upload cancelled.", { code: "cancelled" });
				const start = (n - 1) * upload.chunkSize;
				const length = Math.min(upload.chunkSize, stat.size - start);
				const chunk = Buffer.alloc(length);
				await handle.read(chunk, 0, length, start);
				await putPart({ upload, n, chunk, signal });
				upload.done.push(n);
				writeUploads({ ...readUploads(), [key]: upload });
				onProgress?.({ phase: "uploading", progress: upload.done.length / partCount });
			}
		} finally {
			await handle.close();
		}

		onProgress?.({ phase: "finishing", progress: 1 });
		const completed = await api("POST", `/v1/uploads/${encodeURIComponent(upload.id)}/complete`, {
			signal,
			body: { parts: partCount },
		});
		const assetId = String(completed.asset_id ?? completed.id);
		const rest = readUploads();
		delete rest[key];
		writeUploads(rest);

		const share = await api("POST", "/v1/shares", {
			signal,
			body: {
				asset_id: assetId,
				permission: allowDownload ? "download" : "view",
				expires_in_days: expiresInDays || null,
			},
		});
		return { url: String(share.url), expiresAt: share.expires_at ?? null, assetId };
	} catch (error) {
		if (signal.aborted) throw new CloudError("Upload cancelled.", { code: "cancelled" });
		if (error instanceof CloudError) throw error;
		throw new CloudError("Couldn't reach Worksuite Cloud. Check your connection and try again — the upload will resume.", {
			code: "network",
		});
	} finally {
		active = null;
	}
}

function cancelUpload() {
	active?.abort();
}

module.exports = { uploadAndShare, cancelUpload };
