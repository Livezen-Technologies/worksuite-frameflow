// Cloud projects (SRS CL-02…CL-04): project JSON goes to
// /v1/video/projects with If-Match revisions, media to chunked uploads.
// The page decides what to sync; this side holds the tokens and talks HTTP.
const { api, uploadParts, asCloudError, CloudError } = require("./cloud-upload");

const asProject = (p) => ({
	id: String(p.id),
	name: String(p.name ?? "Untitled"),
	revision: Number(p.revision ?? 0),
	updatedAt: p.updated_at ?? null,
});

async function listProjects() {
	const body = await api("GET", "/v1/video/projects");
	const items = Array.isArray(body) ? body : (body.data ?? body.projects ?? []);
	return items.map(asProject);
}

async function createProject({ name }) {
	return asProject(await api("POST", "/v1/video/projects", { body: { name } }));
}

async function getProject({ id }) {
	const body = await api("GET", `/v1/video/projects/${encodeURIComponent(id)}`);
	return { ...asProject(body), data: body.data ?? null };
}

/** Saves the project if the cloud is still at `revision`; else reports a conflict. */
async function putProject({ id, revision, name, data }) {
	try {
		const body = await api("PUT", `/v1/video/projects/${encodeURIComponent(id)}`, {
			headers: { "If-Match": `"${revision}"` },
			body: { name, data },
		});
		return { ok: true, revision: Number(body.revision ?? revision + 1) };
	} catch (error) {
		if (error instanceof CloudError && (error.status === 409 || error.status === 412)) {
			return { ok: false, code: "conflict", message: "The cloud copy changed on another device." };
		}
		throw error;
	}
}

/** Media is immutable by hash, so the hash keys a resumable upload. */
async function uploadMedia({ name, contentType, sha256, data }) {
	const bytes = Buffer.from(data);
	const assetId = await uploadParts({
		key: `media|${sha256}`,
		filename: String(name),
		size: bytes.length,
		contentType: String(contentType || "application/octet-stream"),
		purpose: "project-media",
		readPart: async ({ start, length }) => bytes.subarray(start, start + length),
	});
	return { assetId };
}

async function downloadAsset({ assetId }) {
	const { url } = await api("GET", `/v1/assets/${encodeURIComponent(assetId)}/download`);
	const res = await fetch(url);
	if (!res.ok) throw new CloudError(`Download failed (${res.status})`, { code: "http", status: res.status });
	return new Uint8Array(await res.arrayBuffer());
}

const operations = { listProjects, createProject, getProject, putProject, uploadMedia, downloadAsset };

/** One IPC entry point: `{ ok: true, value }` or `{ ok: false, code, message }`. */
async function run(operation, args) {
	const fn = operations[operation];
	if (!fn) return { ok: false, code: "denied", message: "Unknown operation" };
	try {
		const value = await fn(args ?? {});
		if (value && value.ok === false) return value;
		return { ok: true, value };
	} catch (error) {
		const e = asCloudError(error);
		return { ok: false, code: e.code ?? "error", message: e.message };
	}
}

module.exports = { run };
