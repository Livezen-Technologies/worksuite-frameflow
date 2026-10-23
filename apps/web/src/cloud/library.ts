"use client";

import type { LibraryItem, LibraryKind, LibraryScope } from "@/account/types";
import type { EditorCore } from "@/core";
import { importLutFiles } from "@/lut/library";
import { processMediaAssets } from "@/media/processing";

/** What a file is in the asset library (CL-05). */
export function kindForFile(file: File): LibraryKind {
	const name = file.name.toLowerCase();
	if (/\.(cube|zip)$/.test(name)) return "lut";
	if (/logo/.test(name) || file.type === "image/svg+xml") return "logo";
	if (file.type.startsWith("image/")) return "image";
	if (/intro|outro|opener/.test(name) && file.type.startsWith("video/"))
		return "intro";
	if (file.type.startsWith("video/")) return "video";
	if (file.type.startsWith("audio/"))
		return /music|song|track|beat/.test(name) ? "music" : "audio";
	return "other";
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	return Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

export async function addToLibrary({
	file,
	scope,
	folderId,
}: {
	file: File;
	scope: LibraryScope;
	folderId: string | null;
}): Promise<LibraryItem> {
	const cloud = window.worksuite?.cloud;
	if (!cloud) throw new Error("The asset library needs the desktop app.");
	const data = await file.arrayBuffer();
	const result = await cloud.sync("addLibraryItem", {
		scope,
		folderId,
		name: file.name,
		kind: kindForFile(file),
		contentType: file.type || "application/octet-stream",
		sha256: await sha256(data),
		data,
	});
	if (!result.ok) throw new Error(result.message);
	return result.value;
}

/** Downloads a library item into the open project (or the LUT library). */
export async function bringIntoProject({
	editor,
	item,
}: {
	editor: EditorCore;
	item: LibraryItem;
}): Promise<"media" | "lut"> {
	const cloud = window.worksuite?.cloud;
	if (!cloud) throw new Error("The asset library needs the desktop app.");
	const result = await cloud.sync("downloadAsset", { assetId: item.assetId });
	if (!result.ok) throw new Error(result.message);
	const file = new File([result.value], item.name, { type: item.contentType });
	if (item.kind === "lut") {
		const imported = await importLutFiles([file]);
		if (imported.added.length === 0) {
			throw new Error(imported.failed[0]?.reason ?? "Not a LUT file");
		}
		return "lut";
	}
	const [asset] = await processMediaAssets({ files: [file] });
	if (!asset) throw new Error(`Couldn't open ${item.name}`);
	await editor.media.addMediaAsset({
		projectId: editor.project.getActive().metadata.id,
		asset,
	});
	return "media";
}
