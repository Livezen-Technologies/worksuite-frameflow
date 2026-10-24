"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "@/editor/use-editor";
import { useT } from "@/i18n";
import { PACK_TRANSITION_DRAG_TYPE } from "@/transitions/components/timeline-transition";
import { checkProjectPacks, addCatalogAsset, resolveProjectPlaceholders } from "../actions";
import { addPackItem, CLIP_APPLY_TYPES, stripFinishedPlaceholders } from "../apply-pack";
import { onPackContentChange } from "../registry";
import { assetsBridge, useAssetLibrary } from "../store";
import type { AssetStoreState, CatalogPack, PackType } from "../types";
import { AssetLibraryView } from "./asset-library-view";

const OFFLINE_STATE: AssetStoreState = {
	settings: { channel: "stable", missingPacks: "auto", autoUpdate: true, starterPacks: true, unmeteredOnly: false, storageLimitBytes: 0 },
	catalog: null,
	catalogStatus: { state: "idle", error: null, fetchedAt: null, stale: false },
	installed: {},
	builtin: [
		{ id: "worksuite-essentials", type: "motion", title: "Worksuite Essentials", version: "builtin" },
		{ id: "subscribe-buttons", type: "motion", title: "Subscribe buttons", version: "builtin" },
		{ id: "worksuite-sfx", type: "sounds", title: "Worksuite sound effects", version: "builtin" },
	],
	downloads: {},
};

/**
 * Opens the Asset Library (entry point in the Animations and Sounds panels
 * and the editor header). Also, once per editor: starts the asset store,
 * fetches packs an opened project needs, and resolves placeholder clips
 * when their packs arrive.
 */
export function AssetLibraryButton({ type = null, compact = false }: { type?: PackType | null; compact?: boolean }) {
	const setOpen = useAssetLibrary((s) => s.setOpen);
	const t = useT();
	return (
		<div className="flex items-center justify-between gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground">
			{!compact && <span>{t("More in the Asset Library")}</span>}
			<button type="button" className="font-medium text-primary hover:underline" onClick={() => setOpen(true, type)}>
				{t("Open Asset Library")}
			</button>
			<AssetLibraryHost />
		</div>
	);
}

/** Header entry: always mounted in the editor, so it also hosts the overlay and wiring. */
export function AssetLibraryHeaderButton() {
	const setOpen = useAssetLibrary((s) => s.setOpen);
	const t = useT();
	const updates = useAssetLibrary((s) =>
		s.state ? Object.values(s.state.installed).filter((p) => s.state?.catalog?.packs.some((c) => c.id === p.id && c.version !== p.version)).length : 0,
	);
	return (
		<>
			<button
				type="button"
				className="relative rounded-md px-2 py-1 text-sm hover:bg-accent"
				title={t("Asset Library — download motion graphics, sounds, LUTs, fonts and more")}
				onClick={() => setOpen(true)}
			>
				{t("Assets")}
				{updates > 0 && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-400" aria-label={t("{count} pack updates", { count: updates })} />}
			</button>
			<AssetLibraryHost />
		</>
	);
}

let hostMounted = 0;

/** The overlay and the background wiring; renders once however many buttons exist. */
function AssetLibraryHost() {
	const editor = useEditor();
	const { state, open, focusType, setOpen, init, install, run, pendingAsk, dismissAsk } = useAssetLibrary();
	const projectId = useEditor((e) => e.project.getActiveOrNull()?.metadata.id ?? null);
	const isPrimary = useHostSlot();
	const t = useT();

	useEffect(() => {
		if (isPrimary) void init();
	}, [isPrimary, init]);
	useEffect(() => {
		if (isPrimary && projectId && state) void checkProjectPacks(editor);
	}, [isPrimary, projectId, state?.catalog, editor, state]);
	useEffect(() => {
		if (!isPrimary) return;
		return onPackContentChange(() => void resolveProjectPlaceholders(editor));
	}, [isPrimary, editor]);
	useEffect(() => {
		if (!isPrimary) return;
		// An undo of an unrelated step can bring back a finished drop's placeholder.
		return editor.command.onHistoryChange(() => stripFinishedPlaceholders(editor));
	}, [isPrimary, editor]);

	if (!isPrimary) return null;
	const bridge = assetsBridge();
	return (
		<>
			{pendingAsk.length > 0 &&
				createPortal(
					<div role="alertdialog" className="fixed right-4 bottom-4 z-50 max-w-sm rounded-lg border bg-popover p-4 text-sm shadow-lg">
						<p className="mb-3">
							{pendingAsk.length === 1
								? t("This project uses a pack that isn't on this device: {packs}. Download now?", { packs: pendingAsk.join(", ") })
								: t("This project uses {count} packs that aren't on this device: {packs}. Download now?", { count: pendingAsk.length, packs: pendingAsk.join(", ") })}
						</p>
						<div className="flex justify-end gap-2">
							<button type="button" className="rounded border px-3 py-1" onClick={dismissAsk}>
								{t("Not now")}
							</button>
							<button
								type="button"
								className="rounded bg-primary px-3 py-1 text-primary-foreground"
								onClick={() => {
									for (const id of pendingAsk) void install(id);
									dismissAsk();
								}}
							>
								{t("Download")}
							</button>
						</div>
					</div>,
					document.body,
				)}
			{open &&
				createPortal(
					<AssetLibraryView
						state={state ?? OFFLINE_STATE}
						desktop={!!bridge}
						initialType={(focusType as PackType | null) ?? null}
						catalogBase={state ? `${process.env.NEXT_PUBLIC_WSC_ASSET_URL ?? "https://download.worksuitecloud.com/assets"}/${state.settings.channel}/` : undefined}
						onClose={() => setOpen(false)}
						actions={{
							install: (id) => void install(id),
							pause: (id) => void run((b) => b.pause(id)),
							resume: (id) => void run((b) => b.resume(id)),
							cancel: (id) => void run((b) => b.cancel(id)),
							uninstall: (id) => void run((b) => b.uninstall(id)),
							refresh: () => void run((b) => b.refresh()),
							clearUnused: () => void run((b) => b.clearUnused()),
							configure: (patch) => void run((b) => b.configure(patch)),
							addAsset: (pack, assetId) => void addCatalogAsset({ editor, packId: pack.id, version: pack.version, assetId }),
							downloadAndAdd: (pack) => {
								addPackItem({ editor, request: packRequest({ pack, assetId: null }) });
								setOpen(false);
							},
							beginDrag: ({ pack, dataTransfer, assetId }) => {
								const request = packRequest({ pack, assetId: assetId ?? null });
								editor.timeline.dragSource.begin({
									dataTransfer,
									dragData: {
										type: "pack",
										id: pack.id,
										name: pack.title,
										packId: pack.id,
										packType: pack.type,
										itemId: request.itemId,
										...(CLIP_APPLY_TYPES.includes(pack.type) ? { targetElementTypes: ["video", "image"] } : {}),
									},
								});
								if (pack.type === "transitions") dataTransfer.setData(PACK_TRANSITION_DRAG_TYPE, JSON.stringify({ packId: pack.id, title: pack.title, itemId: request.itemId }));
							},
							endDrag: () => editor.timeline.dragSource.end(),
							...(bridge?.setFavorite ? { setFavorite: (args: { packId: string; on: boolean }) => void run((b) => b.setFavorite?.(args) ?? Promise.resolve()) } : {}),
							...(bridge?.history ? { loadHistory: (cursor?: string | null) => bridge.history?.({ cursor }) ?? Promise.resolve({ signedIn: false, data: [], next_cursor: null }) } : {}),
							...(bridge?.registerDevice ? { retryDevice: () => void run((b) => b.registerDevice?.() ?? Promise.resolve()) } : {}),
						}}
					/>,
					document.body,
				)}
		</>
	);
}

/** Only the first mounted host does the work. */
function useHostSlot(): boolean {
	const [slot] = useState(() => ++hostMounted);
	useEffect(() => () => {
		hostMounted = Math.max(0, hostMounted - 1);
	}, []);
	return slot === 1;
}

/** What Download & Add or a drag adds: one asset of a motion pack, else the pack's first item. */
function packRequest({ pack, assetId }: { pack: CatalogPack; assetId: string | null }) {
	return {
		packId: pack.id,
		packType: pack.type,
		title: pack.title,
		itemId: assetId ?? (pack.type === "motion" ? (pack.assetIds?.[0] ?? null) : null),
		target: { kind: "default" as const },
	};
}
