import type {
	MediaAssetData,
	SerializedProject,
} from "@/services/storage/types";

/**
 * On-disk layout of a portable project folder (SRS PR-01–PR-05):
 *
 *   My film.ffproj/
 *     project.json   { format, version, project }
 *     media.json     [{ ...media metadata, file: "media/<id8>-<name>" }]
 *     media/         every file the project uses, copied in ("collected")
 *
 * Paths inside are relative, so the folder opens on any computer.
 */

export const FOLDER_FORMAT = "frameflow-project";
export const FOLDER_VERSION = 1;

export interface FolderManifest {
	format: typeof FOLDER_FORMAT;
	version: number;
	project: SerializedProject;
}

export type FolderMediaEntry = MediaAssetData & {
	file: string;
	/** The file's MIME type, so it decodes the same after import. */
	mimeType?: string;
};

/** A stable, readable file name: short id prefix keeps same-named clips apart. */
export function mediaFileName({
	id,
	name,
}: {
	id: string;
	name: string;
}): string {
	const clean = name
		// eslint-disable-next-line no-control-regex -- strip control characters from file names
		.replace(/[\x00-\x1f<>:"|?*\\/]/g, "_")
		.replace(/^\.+/, "")
		.slice(0, 120);
	return `${id.slice(0, 8)}-${clean || "media"}`;
}

export function buildManifest({
	project,
}: {
	project: SerializedProject;
}): string {
	const manifest: FolderManifest = {
		format: FOLDER_FORMAT,
		version: FOLDER_VERSION,
		project,
	};
	return JSON.stringify(manifest, null, 2);
}

export function buildMediaIndex({
	media,
}: {
	media: (MediaAssetData & { mimeType?: string })[];
}): FolderMediaEntry[] {
	return media
		.filter((item) => !item.ephemeral)
		.map((item) => ({
			...item,
			// Blob URLs die with the session; the thumbnail is rebuilt on import.
			thumbnailUrl: item.thumbnailUrl?.startsWith("blob:")
				? undefined
				: item.thumbnailUrl,
			file: `media/${mediaFileName(item)}`,
		}));
}

export class FolderFormatError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function parseManifest(text: string): SerializedProject {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new FolderFormatError("project.json is not valid JSON.");
	}
	if (!isRecord(data) || data.format !== FOLDER_FORMAT)
		throw new FolderFormatError("This folder is not a FrameFlow project.");
	if (typeof data.version !== "number" || data.version > FOLDER_VERSION)
		throw new FolderFormatError(
			"This project was saved by a newer version of FrameFlow. Update the app to open it.",
		);
	const project = data.project;
	if (
		!isRecord(project) ||
		!isRecord(project.metadata) ||
		!Array.isArray(project.scenes)
	)
		throw new FolderFormatError("project.json is missing the project.");
	// Shape checked above; the rest is validated by the editor's migrations.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return project as unknown as SerializedProject;
}

export function parseMediaIndex(text: string): FolderMediaEntry[] {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return [];
	}
	if (!Array.isArray(data)) return [];
	return data.filter(
		(item): item is FolderMediaEntry =>
			isRecord(item) &&
			typeof item.id === "string" &&
			typeof item.name === "string" &&
			typeof item.type === "string" &&
			typeof item.file === "string",
	);
}

/** The bare file name inside media/ for an entry (never a path). */
export function entryFileName(entry: FolderMediaEntry): string {
	return entry.file.split(/[\\/]/).pop() ?? mediaFileName(entry);
}

/**
 * Pair missing media with files the user picked: same name first, then
 * same size, so a renamed copy of the original still relinks.
 */
export function planRelink({
	missing,
	picked,
}: {
	missing: FolderMediaEntry[];
	picked: { name: string; size: number }[];
}): Map<string, number> {
	const used = new Set<number>();
	const plan = new Map<string, number>();
	const take = ({
		entry,
		match,
	}: {
		entry: FolderMediaEntry;
		match: (p: { name: string; size: number }) => boolean;
	}) => {
		if (plan.has(entry.id)) return;
		const index = picked.findIndex((p, i) => !used.has(i) && match(p));
		if (index >= 0) {
			used.add(index);
			plan.set(entry.id, index);
		}
	};
	for (const entry of missing)
		take({
			entry,
			match: (p) => p.name.toLowerCase() === entry.name.toLowerCase(),
		});
	for (const entry of missing)
		take({ entry, match: (p) => p.size === entry.size });
	return plan;
}
