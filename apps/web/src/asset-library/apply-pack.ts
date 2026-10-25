"use client";

import { toast } from "sonner";
import { AddTrackCommand, DeleteElementsCommand, InsertElementCommand, RemoveTrackCommand } from "@/commands/timeline";
import type { EditorCore } from "@/core";
import { effectsRegistry } from "@/effects";
import { FILTER_CATEGORIES, withFilter } from "@/filters/library";
import { t } from "@/i18n";
import { addPackAnimation } from "@/lottie/actions";
import { findPackAsset } from "@/lottie/catalog";
import { LOTTIE_GRAPHIC_DEFINITION_ID } from "@/lottie/types";
import { withCreativeLut } from "@/lut/apply";
import { importLutFiles } from "@/lut/library";
import type { TimelineElement, TimelineTrack, VisualElement } from "@/timeline";
import { buildGraphicElement, buildLibraryAudioElement, buildTextElement, isVisualElement } from "@/timeline/element-utils";
import { findClipBefore } from "@/transitions/windows";
import { generateUUID } from "@/utils/id";
import { mediaTime, mediaTimeFromSeconds, roundMediaTime, TICKS_PER_SECOND } from "@/wasm";
import { effectStackParser, itemJson, packItemFile, parseFilter, parseTextTemplate, parseTransition } from "./pack-items";
import { insertPackMedia, placementOn } from "./pack-media";
import { cutTarget, type PackDropRequest, type PackDropTarget, type PlaceholderRef, finishedPlaceholders, runPackDrop } from "./pack-drop";
import { placeholderLottieData } from "./placeholders";
import { isPackRegistered, onPackContentChange, packSounds, pickItem, syncInstalledPacks, type PackContentItem } from "./registry";
import { assetsBridge, useAssetLibrary } from "./store";
import type { PackType } from "./types";

/*
 * The default add action for each pack type (blueprint §10), for drops on
 * the timeline and "Download & Add", and the editor side of a drop of a
 * pack that isn't installed yet (placeholder, install, swap; see pack-drop.ts).
 */

const parseEffectStack = effectStackParser({ knownType: (type) => effectsRegistry.getAll().some((e) => e.type === type) });

/** Pack types whose items apply to a clip rather than becoming one. */
export const CLIP_APPLY_TYPES: PackType[] = ["luts", "filters", "color-profiles", "effects"];

/** Pack types whose default add makes a new clip (these get a placeholder clip). */
export const CLIP_TYPES: PackType[] = ["motion", "graphics", "stickers", "sounds", "text-templates"];

type ClipRef = { track: TimelineTrack; element: VisualElement };

function allTracks(editor: EditorCore): TimelineTrack[] {
	const tracks = editor.scenes.getActiveScene().tracks;
	return [...tracks.overlay, tracks.main, ...tracks.audio];
}

/** The clip(s) an apply-type item goes on: the drop target, else the selection. */
function clipTargets({ editor, target }: { editor: EditorCore; target: PackDropTarget }): ClipRef[] {
	const refs =
		target.kind === "clip" ? [{ trackId: target.trackId, elementId: target.elementId }] : editor.selection.getSelectedElements();
	return editor.timeline.getElementsWithTracks({ elements: refs }).flatMap(({ track, element }) => (isVisualElement(element) ? [{ track, element }] : []));
}

const isCut = (e: TimelineElement): e is Extract<TimelineElement, { type: "video" | "image" }> => e.type === "video" || e.type === "image";

/** The cut nearest the playhead on the main track: the clip after it. */
function nearestCut(editor: EditorCore): { trackId: string; element: Extract<TimelineElement, { type: "video" | "image" }>; maxSeconds: number } | null {
	const track = editor.scenes.getActiveSceneOrNull()?.tracks.main;
	if (!track) return null;
	const clips = track.elements.filter(isCut);
	const now = editor.playback.getCurrentTime();
	let best: { element: (typeof clips)[number]; before: (typeof clips)[number]; d: number } | null = null;
	for (const clip of clips) {
		const before = findClipBefore({ clips, clip, ticksPerSecond: TICKS_PER_SECOND });
		if (!before) continue;
		const d = Math.abs(clip.startTime - now);
		if (!best || d < best.d) best = { element: clip, before, d };
	}
	if (!best) return null;
	const max = Math.max(0.1, Math.min(5, best.element.duration / TICKS_PER_SECOND, best.before.duration / TICKS_PER_SECOND));
	return { trackId: track.id, element: best.element, maxSeconds: max };
}

/** An item that can't be used: an error the drop shows, never a silent no-op. */
function unreadable(item: PackContentItem): never {
	throw new Error(t("{name} couldn't be read from its pack.", { name: item.name }));
}

/**
 * Adds or applies one item of an installed pack. True when something was
 * added; false when it only installed (a toast has said why/what next);
 * throws when the item can't be used. Runs through the normal
 * timeline commands; the caller squashes them into one undo step.
 */
export async function performPackAdd({
	editor,
	packType,
	item,
	target,
	version,
}: {
	editor: EditorCore;
	packType: PackType;
	item: PackContentItem;
	target: PackDropTarget;
	version: string;
}): Promise<boolean> {
	const startTime = target.kind === "track" ? target.startTime : editor.playback.getCurrentTime();
	const trackId = target.kind === "track" ? target.trackId : null;
	switch (packType) {
		case "motion": {
			const assetId = String((item.raw as { id?: string }).id ?? item.id.split("/").pop());
			const asset = await findPackAsset(assetId, { id: item.packId, version });
			if (!asset) unreadable(item);
			addPackAnimation({ editor, asset, startTime });
			return true;
		}
		case "graphics":
		case "stickers":
			await insertPackMedia({ editor, item, startTime, trackId });
			return true;
		case "sounds": {
			const sound = packSounds().find((s) => s.packId === item.packId && (s.id === item.id || item.packId === item.id)) ?? packSounds().find((s) => s.packId === item.packId);
			if (!sound) unreadable(item);
			let seconds = 1;
			try {
				const audio = new Audio(sound.url);
				await new Promise<void>((resolve, reject) => {
					audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
					audio.addEventListener("error", () => reject(new Error("load")), { once: true });
				});
				seconds = audio.duration || 1;
			} catch {
				// Keep one second.
			}
			const element = buildLibraryAudioElement({ sourceUrl: sound.url, name: sound.name, duration: roundMediaTime({ time: mediaTimeFromSeconds({ seconds }) }), startTime });
			const placement = placementOn({ editor, trackId, elementType: "audio" });
			editor.timeline.insertElement({ element, placement: placement.mode === "explicit" ? placement : { mode: "auto", trackType: "audio" } });
			return true;
		}
		case "text-templates": {
			const template = parseTextTemplate({ raw: await itemJson(item), item });
			if (!template) unreadable(item);
			editor.timeline.insertElement({
				element: buildTextElement({ raw: { name: template.name, params: template.params }, startTime }),
				placement: placementOn({ editor, trackId, elementType: "text" }),
			});
			return true;
		}
		case "transitions": {
			const transition = parseTransition({ raw: await itemJson(item), item });
			if (!transition) unreadable(item);
			const cut = cutTarget({ target, nearest: () => nearestCut(editor) });
			if (!cut) {
				// Installed all the same: say so and where it goes.
				toast.success(t("Installed — drop it on a cut"), { description: t("Put two clips next to each other, then drag {name} onto the cut between them (it's also under Downloaded in Transitions).", { name: item.name }) });
				return false;
			}
			editor.timeline.updateElements({
				updates: [{ trackId: cut.trackId, elementId: cut.elementId, patch: { transitionIn: { ...transition.value, duration: Math.min(cut.maxSeconds, transition.value.duration) } } }],
			});
			return true;
		}
		case "filters":
		case "color-profiles":
		case "effects":
		case "luts": {
			const targets = clipTargets({ editor, target });
			if (targets.length === 0) {
				toast.info(t("Installed — select a video or photo clip, then click Add again."));
				return false;
			}
			if (packType === "luts") {
				const { added } = await importLutFiles([await packItemFile({ item })]);
				const lut = added[0];
				if (!lut) unreadable(item);
				editor.timeline.updateElements({
					updates: targets.map(({ track, element }) => ({
						trackId: track.id,
						elementId: element.id,
						patch: { effects: withCreativeLut({ effects: element.effects, lutId: lut.id, makeId: generateUUID }) },
					})),
				});
				return true;
			}
			if (packType === "effects") {
				const stack = parseEffectStack({ raw: await itemJson(item), item });
				if (!stack) unreadable(item);
				for (const { track, element } of targets)
					for (const effect of stack.effects) {
						const effectId = editor.timeline.addClipEffect({ trackId: track.id, elementId: element.id, effectType: effect.type });
						if (effectId && Object.keys(effect.params).length) editor.timeline.updateClipEffectParams({ trackId: track.id, elementId: element.id, effectId, params: effect.params });
					}
				return true;
			}
			const filter = parseFilter({ raw: await itemJson(item), item });
			if (!filter) unreadable(item);
			editor.timeline.updateElements({
				updates: targets.map(({ track, element }) => ({
					trackId: track.id,
					elementId: element.id,
					patch: { effects: withFilter({ effects: element.effects, preset: { ...filter, category: FILTER_CATEGORIES[0] }, makeId: generateUUID }) },
				})),
			});
			return true;
		}
		case "fonts":
			toast.success(t("{name} is ready in the font list.", { name: item.name }));
			return false;
		default:
			toast.success(t("{name} is installed. Find it under Downloaded in its panel.", { name: item.name }));
			return false;
	}
}

/** Inserts the placeholder clip for a drop, outside the undo history. */
function insertDropPlaceholder({ editor, request }: { editor: EditorCore; request: PackDropRequest }): PlaceholderRef | null {
	const target = request.target;
	if (!editor.scenes.getActiveSceneOrNull()) return null;
	const startTime = target.kind === "track" ? target.startTime : editor.playback.getCurrentTime();
	const lottie = placeholderLottieData({ packId: request.packId, version: "0.0.0", assetId: request.itemId ?? "pending" });
	const element = buildGraphicElement({
		definitionId: LOTTIE_GRAPHIC_DEFINITION_ID,
		name: t("Downloading {name}…", { name: request.title }),
		startTime,
		params: { "transform.scaleX": 0.5, "transform.scaleY": 0.5 },
		lottie,
		duration: mediaTime({ ticks: 3 * TICKS_PER_SECOND }),
	});
	const overlayBefore = new Set(editor.scenes.getActiveScene().tracks.overlay.map((tr) => tr.id));
	let trackId = target.kind === "track" ? target.trackId : null;
	let newTrack = false;
	const placement = placementOn({ editor, trackId, elementType: "graphic" });
	// Direct execute(): changes the tracks without an undo step.
	if (placement.mode === "explicit") {
		const insert = new InsertElementCommand({ element, placement });
		insert.execute();
		const id = insert.getElementId();
		return editor.timeline.findTrackIdForElement({ elementId: id }) ? { trackId: placement.trackId, elementId: id, newTrack: false } : null;
	}
	if (target.kind === "track" && (target.isNewTrack || trackId)) {
		const add = new AddTrackCommand({ type: "graphic", index: target.trackIndex });
		add.execute();
		trackId = add.getTrackId();
		newTrack = true;
		const insert = new InsertElementCommand({ element, placement: { mode: "explicit", trackId } });
		insert.execute();
		return { trackId, elementId: insert.getElementId(), newTrack };
	}
	const insert = new InsertElementCommand({ element, placement: { mode: "auto" } });
	insert.execute();
	const elementId = insert.getElementId();
	const placedOn = editor.timeline.findTrackIdForElement({ elementId });
	if (!placedOn) return null;
	return { trackId: placedOn, elementId, newTrack: !overlayBefore.has(placedOn) };
}

function removeDropPlaceholder({ editor, ref }: { editor: EditorCore; ref: PlaceholderRef }) {
	const trackId = editor.timeline.findTrackIdForElement({ elementId: ref.elementId });
	if (trackId) new DeleteElementsCommand({ elements: [{ trackId, elementId: ref.elementId }] }).execute();
	if (ref.newTrack) {
		const track = editor.timeline.getTrackById({ trackId: ref.trackId });
		if (track && track.elements.length === 0) new RemoveTrackCommand(ref.trackId).execute();
	}
}

/** Resolves when an installed pack's items are registered with the panels. */
function whenRegistered({ packId, timeoutMs = 20_000 }: { packId: string; timeoutMs?: number }): Promise<void> {
	if (isPackRegistered(packId)) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			off();
			reject(new Error(t("The pack installed but couldn't be read.")));
		}, timeoutMs);
		const off = onPackContentChange(() => {
			if (!isPackRegistered(packId)) return;
			clearTimeout(timer);
			off();
			resolve();
		});
		const installed = useAssetLibrary.getState().state?.installed;
		if (installed)
			void syncInstalledPacks(installed).then((failed) => {
				if (!failed.includes(packId)) return;
				clearTimeout(timer);
				off();
				reject(new Error(t("The pack installed but couldn't be read.")));
			});
	});
}


const installedVersion = (packId: string) => useAssetLibrary.getState().state?.installed[packId]?.version ?? "builtin";

/**
 * Adds a pack's item at `target`. Installed: straight away, one undo step.
 * Not installed: a placeholder with a progress ring, the pack (and its
 * dependencies) installs, then the real clip/effect/LUT/transition replaces
 * the placeholder as one undo step. Cancel removes the placeholder.
 */
export function addPackItem({ editor, request }: { editor: EditorCore; request: PackDropRequest }) {
	const bridge = assetsBridge();
	const perform = async () => {
		const item = pickItem({ packId: request.packId, itemId: request.itemId });
		if (!item) throw new Error(t("{name} has nothing to add here.", { name: request.title }));
		if (!editor.scenes.getActiveSceneOrNull()) {
			toast.success(request.packType === "transitions" ? t("Installed — drop it on a cut") : t("{name} is installed", { name: request.title }), { description: t("Open a project to use it; it's under Downloaded in its panel.") });
			return false;
		}
		const added = await performPackAdd({ editor, packType: request.packType, item, target: request.target, version: installedVersion(request.packId) });
		if (added) toast.success(t("Added {name}", { name: request.title }));
		return added;
	};
	const installedNow = isPackRegistered(request.packId);
	if (!installedNow && !bridge) {
		toast.error(t("Downloading packs needs the desktop app."));
		return null;
	}
	return runPackDrop({
		request: { ...request, placeholder: request.placeholder ?? CLIP_TYPES.includes(request.packType) },
		deps: {
			insertPlaceholder: () => (installedNow ? null : insertDropPlaceholder({ editor, request })),
			removePlaceholder: (ref) => removeDropPlaceholder({ editor, ref }),
			install: async () => {
				if (installedNow) return true;
				if (!editor.scenes.getActiveSceneOrNull()) toast.info(t("Downloading {name}…", { name: request.title }), { description: t("Open a project to add it; it will be under Downloaded in its panel.") });
				const state = await bridge?.install(request.packId);
				if (!state?.installed[request.packId]) {
					const d = state?.downloads[request.packId];
					if (d?.status === "error") throw Object.assign(new Error(d.error ?? t("Download failed")), { code: d.code });
					return false;
				}
				useAssetLibrary.setState({ state });
				await whenRegistered({ packId: request.packId });
				return true;
			},
			cancelInstall: () => void bridge?.cancel(request.packId).catch(() => {}),
			history: { mark: () => editor.command.mark(), squash: (args) => editor.command.squash(args) },
			perform,
			onCancelled: () => toast.info(t("{name} didn't finish downloading", { name: request.title }), { description: t("The download was paused or stopped. Resume it in the Asset Library.") }),
			onError: (error) => {
				const code = typeof error === "object" && error && "code" in error ? error.code : null;
				const message = error instanceof Error ? error.message : String(error);
				toast.error(code === "device-limit" ? t("Device limit reached") : t("Couldn't add {name}", { name: request.title }), { description: message });
			},
		},
	});
}

/**
 * Undo of an unrelated step taken while a pack was downloading can bring
 * a finished drop's placeholder back; this takes such leftovers out again.
 */
export function stripFinishedPlaceholders(editor: EditorCore) {
	if (finishedPlaceholders.size === 0) return;
	const stray = allTracks(editor).flatMap((track) => track.elements.filter((e) => finishedPlaceholders.has(e.id)).map((e) => ({ trackId: track.id, elementId: e.id })));
	if (stray.length) new DeleteElementsCommand({ elements: stray }).execute();
}
