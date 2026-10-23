const { app, BrowserWindow, dialog, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Portable project folders (PR-01–PR-05). A project folder is
 * `<name>.ffproj/` holding project.json, media.json and media/. The page
 * names projects by id only; this module keeps the id → folder map, so the
 * page can never read or write outside a folder the user picked.
 */

const SUBFOLDERS = ["media", "proxies", "waveforms", "captions", "thumbnails"];
const JSON_FILES = new Set(["project.json", "media.json"]);
const linksFile = () => path.join(app.getPath("userData"), "project-folders.json");

let links = null;
/** Folders opened this session but not yet linked to a project id. */
const opened = new Set();

function load() {
	if (links) return links;
	try {
		links = JSON.parse(fs.readFileSync(linksFile(), "utf8"));
	} catch {
		links = {};
	}
	return links;
}

async function persist() {
	await fs.promises.writeFile(linksFile(), JSON.stringify(links, null, 2));
}

function folderOf(projectId) {
	const root = load()[String(projectId)];
	if (!root) throw Object.assign(new Error("Project has no folder"), { code: "unlinked" });
	return root;
}

/** File name only: no separators, no "..", no control characters. */
function safeName(name) {
	const base = path.basename(String(name)).replace(/[\x00-\x1f<>:"|?*\\/]/g, "_");
	if (!base || base === "." || base === "..") throw new Error("Bad file name");
	return base.slice(0, 180);
}

function defaultParent() {
	return path.join(app.getPath("documents"), "Worksuite Projects");
}

async function makeFolder(root) {
	await fs.promises.mkdir(root, { recursive: true });
	for (const sub of SUBFOLDERS) await fs.promises.mkdir(path.join(root, sub), { recursive: true });
}

async function link({ projectId, root }) {
	load()[String(projectId)] = root;
	await persist();
	return { path: root };
}

const win = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

module.exports = {
	get: ({ projectId }) => load()[String(projectId)] ?? null,

	async create({ projectId, name }) {
		await fs.promises.mkdir(defaultParent(), { recursive: true }).catch(() => {});
		const result = await dialog.showSaveDialog(win(), {
			title: "Save project folder",
			defaultPath: path.join(defaultParent(), `${safeName(name || "Project")}.ffproj`),
			buttonLabel: "Save project",
			properties: ["createDirectory"],
		});
		if (result.canceled || !result.filePath) return { saved: false };
		const root = result.filePath.endsWith(".ffproj") ? result.filePath : `${result.filePath}.ffproj`;
		await makeFolder(root);
		await link({ projectId, root });
		return { saved: true, path: root };
	},

	async open() {
		const result = await dialog.showOpenDialog(win(), {
			title: "Open project folder",
			defaultPath: defaultParent(),
			properties: ["openDirectory"],
		});
		if (result.canceled || !result.filePaths[0]) return { opened: false };
		const root = result.filePaths[0];
		if (!fs.existsSync(path.join(root, "project.json"))) {
			return { opened: false, error: "That folder has no project.json." };
		}
		const read = (name) => fs.promises.readFile(path.join(root, name), "utf8");
		const project = await read("project.json");
		const media = await read("media.json").catch(() => "[]");
		opened.add(root);
		return { opened: true, path: root, project, media };
	},

	/** Link a folder from open() to the id the project was stored under. */
	async attach({ projectId, root }) {
		if (!opened.has(root)) throw new Error("Folder was not opened this session");
		return link({ projectId, root });
	},

	async unlink({ projectId }) {
		delete load()[String(projectId)];
		await persist();
	},

	async writeJson({ projectId, name, text }) {
		if (!JSON_FILES.has(name)) throw new Error("Not a project file");
		const root = folderOf(projectId);
		await makeFolder(root);
		// Write then rename, so a crash never leaves half a project.json.
		const target = path.join(root, name);
		await fs.promises.writeFile(`${target}.tmp`, String(text), "utf8");
		await fs.promises.rename(`${target}.tmp`, target);
	},

	async listMedia({ projectId }) {
		const dir = path.join(folderOf(projectId), "media");
		const names = await fs.promises.readdir(dir).catch(() => []);
		const out = [];
		for (const name of names) {
			const stat = await fs.promises.stat(path.join(dir, name)).catch(() => null);
			if (stat?.isFile()) out.push({ name, size: stat.size });
		}
		return out;
	},

	async writeMedia({ projectId, fileName, data }) {
		const dir = path.join(folderOf(projectId), "media");
		await fs.promises.mkdir(dir, { recursive: true });
		await fs.promises.writeFile(path.join(dir, safeName(fileName)), Buffer.from(data));
	},

	async readMedia({ root, projectId, fileName }) {
		const base = projectId ? folderOf(projectId) : root;
		if (!projectId && !opened.has(base)) throw new Error("Folder was not opened this session");
		const data = await fs.promises.readFile(path.join(base, "media", safeName(fileName)));
		return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
	},

	async removeMedia({ projectId, fileName }) {
		await fs.promises.rm(path.join(folderOf(projectId), "media", safeName(fileName)), { force: true });
	},

	show({ projectId }) {
		const root = load()[String(projectId)];
		if (root) shell.showItemInFolder(path.join(root, "project.json"));
	},

	/** Move the whole folder somewhere else and keep the link. */
	async move({ projectId }) {
		const from = folderOf(projectId);
		const result = await dialog.showOpenDialog(win(), {
			title: "Move project folder to…",
			defaultPath: path.dirname(from),
			properties: ["openDirectory", "createDirectory"],
		});
		if (result.canceled || !result.filePaths[0]) return { moved: false };
		const to = path.join(result.filePaths[0], path.basename(from));
		if (to === from) return { moved: false };
		if (fs.existsSync(to)) return { moved: false, error: "A folder with that name is already there." };
		try {
			await fs.promises.rename(from, to);
		} catch {
			// Different drive: copy, then remove the original.
			await fs.promises.cp(from, to, { recursive: true });
			await fs.promises.rm(from, { recursive: true, force: true });
		}
		await link({ projectId, root: to });
		return { moved: true, path: to };
	},

	_test: { safeName },
};
