// Cloud projects (SRS CL-02…CL-04): project JSON goes to
// /v1/video/projects with If-Match revisions, media to chunked uploads.
// The page decides what to sync; this side holds the tokens and talks HTTP.
const { api, uploadParts, asCloudError, CloudError } = require("./cloud-upload");
const account = require("./account");

const ROLES = new Set(["owner", "edit", "view"]);
const asRole = (role) => (ROLES.has(role) ? role : "owner");

const asProject = (p) => ({
	id: String(p.id),
	name: String(p.name ?? "Untitled"),
	revision: Number(p.revision ?? 0),
	updatedAt: p.updated_at ?? null,
	// Team sharing (CL-07): this user's role and who owns it.
	role: asRole(p.my_role ?? p.role),
	ownerName: p.owner?.name ?? null,
	shared: !!p.shared || (p.members_count ?? 0) > 1,
});

const asMember = (m) => ({
	userId: String(m.user_id ?? m.id),
	name: String(m.name ?? m.email ?? "Member"),
	email: m.email ?? null,
	role: m.role === "owner" || m.role === "edit" || m.role === "view" ? m.role : "member",
});

/** People in the active team workspace, to pick from when sharing. */
async function listTeamMembers() {
	const workspaceId = account.getState().profile?.workspaceId;
	const workspace = account.getState().profile?.workspaces?.find((w) => w.id === workspaceId);
	if (!workspace || workspace.type !== "team") return { team: null, members: [] };
	const body = await api("GET", `/v1/workspaces/${encodeURIComponent(workspaceId)}/members`);
	const items = Array.isArray(body) ? body : (body.data ?? []);
	return { team: { id: workspace.id, name: workspace.name }, members: items.map(asMember) };
}

async function listProjectMembers({ id }) {
	const body = await api("GET", `/v1/video/projects/${encodeURIComponent(id)}/members`);
	const items = Array.isArray(body) ? body : (body.data ?? []);
	return items.map(asMember);
}

async function setProjectMember({ id, userId, role }) {
	if (role !== "edit" && role !== "view") throw new CloudError("Unknown role", { code: "denied" });
	await api("PUT", `/v1/video/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
		body: { role },
	});
	return {};
}

async function removeProjectMember({ id, userId }) {
	await api("DELETE", `/v1/video/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`);
	return {};
}

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

// Settings sync (CL-01): one JSON document per user, each key stamped with
// when it last changed so devices merge key by key.
async function getSettings() {
	const body = await api("GET", "/v1/video/settings");
	return {
		revision: Number(body.revision ?? 0),
		items: body.items && typeof body.items === "object" ? body.items : {},
	};
}

async function putSettings({ revision, items }) {
	try {
		const body = await api("PUT", "/v1/video/settings", {
			headers: { "If-Match": `"${Number(revision) || 0}"` },
			body: { items },
		});
		return { ok: true, revision: Number(body.revision ?? Number(revision) + 1) };
	} catch (error) {
		if (error instanceof CloudError && (error.status === 409 || error.status === 412)) {
			return { ok: false, code: "conflict", message: "Settings changed on another device." };
		}
		throw error;
	}
}

// Asset library (CL-05): personal and team folders of logos, intros,
// music and LUTs.
const LIBRARY_KINDS = new Set(["logo", "intro", "music", "lut", "video", "image", "audio", "other"]);
const asLibraryItem = (i) => ({
	id: String(i.id),
	name: String(i.name ?? "Untitled"),
	kind: LIBRARY_KINDS.has(i.kind) ? i.kind : "other",
	folderId: i.folder_id ? String(i.folder_id) : null,
	assetId: String(i.asset_id ?? i.id),
	size: Number(i.size ?? 0),
	contentType: String(i.content_type ?? "application/octet-stream"),
	thumbnailUrl: typeof i.thumbnail_url === "string" ? i.thumbnail_url : null,
	addedBy: i.added_by?.name ?? null,
});

async function listLibrary({ scope, folderId }) {
	const params = new URLSearchParams({ scope: scope === "team" ? "team" : "personal" });
	if (folderId) params.set("folder_id", String(folderId));
	const body = await api("GET", `/v1/video/library?${params}`);
	return {
		folders: (body.folders ?? []).map((f) => ({ id: String(f.id), name: String(f.name ?? "Folder") })),
		items: (body.items ?? body.data ?? []).map(asLibraryItem),
	};
}

async function createLibraryFolder({ scope, name, parentId }) {
	const body = await api("POST", "/v1/video/library/folders", {
		body: { scope: scope === "team" ? "team" : "personal", name: String(name), parent_id: parentId ?? null },
	});
	return { id: String(body.id), name: String(body.name ?? name) };
}

async function addLibraryItem({ scope, folderId, name, kind, contentType, sha256, data }) {
	const bytes = Buffer.from(data);
	const assetId = await uploadParts({
		key: `library|${sha256}`,
		filename: String(name),
		size: bytes.length,
		contentType: String(contentType || "application/octet-stream"),
		purpose: "library",
		readPart: async ({ start, length }) => bytes.subarray(start, start + length),
	});
	const body = await api("POST", "/v1/video/library/items", {
		body: {
			scope: scope === "team" ? "team" : "personal",
			folder_id: folderId ?? null,
			name: String(name),
			kind: LIBRARY_KINDS.has(kind) ? kind : "other",
			asset_id: assetId,
		},
	});
	return asLibraryItem({ size: bytes.length, content_type: contentType, ...body });
}

async function removeLibraryItem({ id }) {
	await api("DELETE", `/v1/video/library/items/${encodeURIComponent(id)}`);
	return {};
}

const operations = {
	getSettings,
	putSettings,
	listLibrary,
	createLibraryFolder,
	addLibraryItem,
	removeLibraryItem,
	listProjects,
	createProject,
	getProject,
	putProject,
	uploadMedia,
	downloadAsset,
	listTeamMembers,
	listProjectMembers,
	setProjectMember,
	removeProjectMember,
};

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
