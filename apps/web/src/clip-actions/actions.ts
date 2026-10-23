"use client";

import { toast } from "sonner";
import { invokeAction } from "@/actions";
import { BatchCommand, Command, type CommandResult } from "@/commands";
import { AddMediaAssetCommand } from "@/commands/media";
import {
	AddTrackCommand,
	InsertElementCommand,
	MoveElementCommand,
} from "@/commands/timeline";
import { generateUUID } from "@/utils/id";
import { SplitElementsCommand } from "@/commands/timeline/element/split-elements";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { usePropertiesStore } from "@/components/editor/panels/properties/stores/properties-store";
import { EditorCore } from "@/core";
import { buildDefaultMaskInstance } from "@/masks";
import type { MediaAsset } from "@/media/types";
import { processMediaAssets } from "@/media/processing";
import type { SceneTracks, TimelineElement } from "@/timeline";
import {
	buildElementFromMedia,
	hasMediaId,
	isMaskableElement,
	isVisualElement,
} from "@/timeline/element-utils";
import {
	mediaTime,
	mediaTimeFromSeconds,
	roundMediaTime,
	TICKS_PER_SECOND,
} from "@/wasm";
import { findSceneCuts, histogram, shiftTrackElements } from "./scenes";

export interface ClipRef {
	trackId: string;
	element: TimelineElement;
}

/** The single selected clip, if exactly one is selected. */
export function selectedClip(editor: EditorCore): ClipRef | null {
	const selected = editor.selection.getSelectedElements();
	if (selected.length !== 1) return null;
	const [found] = editor.timeline.getElementsWithTracks({ elements: selected });
	return found ? { trackId: found.track.id, element: found.element } : null;
}

export function mediaOf({
	editor,
	element,
}: {
	editor: EditorCore;
	element: TimelineElement;
}): MediaAsset | null {
	if (!hasMediaId(element)) return null;
	return editor.media.getAssets().find((a) => a.id === element.mediaId) ?? null;
}

export function cutSelected() {
	invokeAction("copy-selected");
	invokeAction("delete-selected");
}

export function pickFile(accept: string): Promise<File | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = accept;
		input.onchange = () => resolve(input.files?.[0] ?? null);
		input.oncancel = () => resolve(null);
		input.click();
	});
}

/** Swaps the clip's media for another file, keeping its place and length. */
export async function replaceClipMedia({
	editor,
	clip,
	file,
}: {
	editor: EditorCore;
	clip: ClipRef;
	file: File;
}) {
	const { element, trackId } = clip;
	if (!hasMediaId(element)) return;
	const [asset] = await processMediaAssets({ files: [file] });
	if (!asset) return;
	const addMedia = new AddMediaAssetCommand({
		projectId: editor.project.getActive().metadata.id,
		asset,
	});
	const sourceSeconds =
		asset.type === "image" ? Number.POSITIVE_INFINITY : (asset.duration ?? 0);
	const clipSeconds = element.duration / TICKS_PER_SECOND;
	const keepTrim =
		element.trimStart / TICKS_PER_SECOND + clipSeconds <= sourceSeconds;
	const duration = Math.min(clipSeconds, sourceSeconds);
	editor.command.execute({
		command: new BatchCommand([
			addMedia,
			new PatchElementCommand({
				trackId,
				elementId: element.id,
				patch: {
					mediaId: addMedia.getAssetId(),
					name: asset.name,
					...(keepTrim
						? {}
						: {
								trimStart: mediaTime({ ticks: 0 }),
								trimEnd: mediaTime({ ticks: 0 }),
								duration: roundMediaTime({
									time: mediaTimeFromSeconds({ seconds: duration }),
								}),
							}),
					...(Number.isFinite(sourceSeconds)
						? {
								sourceDuration: roundMediaTime({
									time: mediaTimeFromSeconds({ seconds: sourceSeconds }),
								}),
							}
						: {}),
				},
			}),
		]),
	});
	toast.success(`Replaced with ${asset.name}`);
}

/** Generic undoable element patch inside a batch. */
class PatchElementCommand extends Command {
	private saved: SceneTracks | null = null;
	constructor(
		private readonly args: {
			trackId: string;
			elementId: string;
			patch: Record<string, unknown>;
		},
	) {
		super();
	}
	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.saved = editor.scenes.getActiveScene().tracks;
		const patchTrack = <T extends { id: string; elements: TimelineElement[] }>(
			track: T,
		): T =>
			track.id === this.args.trackId
				? {
						...track,
						elements: track.elements.map((e) =>
							e.id === this.args.elementId ? { ...e, ...this.args.patch } : e,
						),
					}
				: track;
		editor.timeline.updateTracks({
			overlay: this.saved.overlay.map(patchTrack),
			main: patchTrack(this.saved.main),
			audio: this.saved.audio.map(patchTrack),
		});
		return undefined;
	}
	undo(): void {
		if (this.saved) EditorCore.getInstance().timeline.updateTracks(this.saved);
	}
}

/** Shifts later clips on one track to open a gap. */
class ShiftTrackCommand extends Command {
	private saved: SceneTracks | null = null;
	constructor(
		private readonly args: { trackId: string; from: number; by: number },
	) {
		super();
	}
	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.saved = editor.scenes.getActiveScene().tracks;
		const shift = <T extends { id: string; elements: TimelineElement[] }>(
			track: T,
		): T =>
			track.id === this.args.trackId
				? {
						...track,
						elements: shiftTrackElements({
							elements: track.elements,
							from: this.args.from,
							by: this.args.by,
						}).map((e) => ({
							...e,
							startTime: mediaTime({ ticks: e.startTime }),
						})),
					}
				: track;
		editor.timeline.updateTracks({
			overlay: this.saved.overlay.map(shift),
			main: shift(this.saved.main),
			audio: this.saved.audio.map(shift),
		});
		return undefined;
	}
	undo(): void {
		if (this.saved) EditorCore.getInstance().timeline.updateTracks(this.saved);
	}
}

/** Contain (fit) ↔ cover (fill) the frame. */
export function toggleFitFill({
	editor,
	clip,
}: {
	editor: EditorCore;
	clip: ClipRef;
}) {
	const { element, trackId } = clip;
	const asset = mediaOf({ editor, element });
	if (!isVisualElement(element) || !asset?.width || !asset.height) return;
	const frame = editor.project.getActive().settings.canvasSize;
	const contain = Math.min(
		frame.width / asset.width,
		frame.height / asset.height,
	);
	const cover = Math.max(
		frame.width / asset.width,
		frame.height / asset.height,
	);
	const fill = cover / contain;
	const scale = Math.abs(Number(element.params["transform.scaleX"] ?? 1));
	const next = Math.abs(scale - fill) < 0.01 ? 1 : fill;
	const sx = Math.sign(Number(element.params["transform.scaleX"] ?? 1)) || 1;
	const sy = Math.sign(Number(element.params["transform.scaleY"] ?? 1)) || 1;
	editor.timeline.updateElements({
		updates: [
			{
				trackId,
				elementId: element.id,
				patch: {
					params: {
						...element.params,
						"transform.scaleX": next * sx,
						"transform.scaleY": next * sy,
						"transform.positionX": 0,
						"transform.positionY": 0,
					},
				},
			},
		],
	});
}

export function flipClip({
	editor,
	clip,
	axis,
}: {
	editor: EditorCore;
	clip: ClipRef;
	axis: "horizontal" | "vertical";
}) {
	const { element, trackId } = clip;
	if (!isVisualElement(element)) return;
	const key = axis === "horizontal" ? "transform.scaleX" : "transform.scaleY";
	editor.timeline.updateElements({
		updates: [
			{
				trackId,
				elementId: element.id,
				patch: {
					params: {
						...element.params,
						[key]: -Number(element.params[key] ?? 1),
					},
				},
			},
		],
	});
}

/** Crop: a rectangle mask with handles on the preview. */
export function startCrop({
	editor,
	clip,
}: {
	editor: EditorCore;
	clip: ClipRef;
}) {
	const { element, trackId } = clip;
	if (!isMaskableElement(element)) return;
	if (!element.masks?.some((m) => m.type === "rectangle")) {
		const asset = mediaOf({ editor, element });
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					patch: {
						masks: [
							buildDefaultMaskInstance({
								maskType: "rectangle",
								elementSize:
									asset?.width && asset.height
										? { width: asset.width, height: asset.height }
										: undefined,
							}),
						],
					},
				},
			],
		});
	}
	usePropertiesStore
		.getState()
		.setActiveTab({ elementType: element.type, tabId: "masks" });
	toast.info("Drag the box's edges on the preview to crop.");
}

function sourceSecondsAt({
	element,
	timelineTime,
}: {
	element: TimelineElement;
	timelineTime: number;
}): number {
	const rate = "retime" in element ? (element.retime?.rate ?? 1) : 1;
	const local = Math.max(
		0,
		Math.min(element.duration, timelineTime - element.startTime),
	);
	return (element.trimStart + local * rate) / TICKS_PER_SECOND;
}

async function openVideo(url: string): Promise<HTMLVideoElement> {
	const video = document.createElement("video");
	video.muted = true;
	video.preload = "auto";
	video.src = url;
	await new Promise<void>((resolve, reject) => {
		video.onloadeddata = () => resolve();
		video.onerror = () => reject(new Error("Couldn't read the video"));
	});
	return video;
}

async function seek({
	video,
	seconds,
}: {
	video: HTMLVideoElement;
	seconds: number;
}) {
	await new Promise<void>((resolve) => {
		video.onseeked = () => resolve();
		video.currentTime = Math.max(
			0,
			Math.min(seconds, (video.duration || seconds) - 0.01),
		);
	});
}

/** The clip's own frame (not the composite) at a timeline time, as PNG. */
export async function captureClipFrame({
	editor,
	clip,
	timelineTime,
}: {
	editor: EditorCore;
	clip: ClipRef;
	timelineTime: number;
}): Promise<File> {
	const asset = mediaOf({ editor, element: clip.element });
	if (!asset?.url) throw new Error("This clip has no picture to capture.");
	const canvas = document.createElement("canvas");
	if (asset.type === "image") {
		const img = new Image();
		img.src = asset.url;
		await img.decode();
		canvas.width = img.naturalWidth;
		canvas.height = img.naturalHeight;
		canvas.getContext("2d")?.drawImage(img, 0, 0);
	} else {
		const video = await openVideo(asset.url);
		await seek({
			video,
			seconds: sourceSecondsAt({ element: clip.element, timelineTime }),
		});
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		canvas.getContext("2d")?.drawImage(video, 0, 0);
		video.removeAttribute("src");
		video.load();
	}
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/png"),
	);
	if (!blob) throw new Error("Couldn't capture the frame.");
	const base = clip.element.name.replace(/\.[^.]+$/, "");
	return new File([blob], `${base} frame.png`, { type: "image/png" });
}

/**
 * Freeze: splits the clip at the playhead and holds that frame for
 * `seconds`, pushing the rest of the track later. One undo step.
 */
export async function freezeFrame({
	editor,
	clip,
	seconds = 3,
}: {
	editor: EditorCore;
	clip: ClipRef;
	seconds?: number;
}) {
	const time = editor.playback.getCurrentTime();
	const { element, trackId } = clip;
	if (
		time <= element.startTime ||
		time >= element.startTime + element.duration
	) {
		toast.error("Move the playhead inside the clip to freeze a frame.");
		return;
	}
	const file = await captureClipFrame({ editor, clip, timelineTime: time });
	const [asset] = await processMediaAssets({ files: [file] });
	if (!asset) return;
	const addMedia = new AddMediaAssetCommand({
		projectId: editor.project.getActive().metadata.id,
		asset,
	});
	const hold = roundMediaTime({ time: mediaTimeFromSeconds({ seconds }) });
	const still = buildElementFromMedia({
		mediaId: addMedia.getAssetId(),
		mediaType: "image",
		name: `Freeze ${element.name}`,
		duration: hold,
		startTime: time,
	});
	editor.command.execute({
		command: new BatchCommand([
			addMedia,
			new SplitElementsCommand({
				elements: [{ trackId, elementId: element.id }],
				splitTime: time,
			}),
			new ShiftTrackCommand({ trackId, from: time, by: hold }),
			new InsertElementCommand({
				element: {
					...still,
					params: { ...still.params, ...pickTransform(element) },
				},
				placement: { mode: "explicit", trackId },
			}),
		]),
	});
	toast.success(`Froze the frame for ${seconds} s`);
}

function pickTransform(element: TimelineElement) {
	return Object.fromEntries(
		Object.entries(element.params).filter(([key]) =>
			key.startsWith("transform."),
		),
	);
}

/** Split scene: cuts the clip wherever the shot changes. */
export async function splitScenes({
	editor,
	clip,
	onProgress,
}: {
	editor: EditorCore;
	clip: ClipRef;
	onProgress?: (fraction: number) => void;
}): Promise<number> {
	const { element, trackId } = clip;
	const asset = mediaOf({ editor, element });
	if (!asset?.url || asset.type !== "video")
		throw new Error("Split scene works on video clips.");
	const video = await openVideo(asset.url);
	const canvas = document.createElement("canvas");
	canvas.width = 32;
	canvas.height = 18;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) throw new Error("Canvas unavailable");
	const clipSeconds = element.duration / TICKS_PER_SECOND;
	const step = Math.max(0.25, clipSeconds / 600);
	const times: number[] = [];
	const histograms: Float32Array[] = [];
	for (let t = 0; t < clipSeconds; t += step) {
		const timelineTime = element.startTime + t * TICKS_PER_SECOND;
		await seek({ video, seconds: sourceSecondsAt({ element, timelineTime }) });
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
		times.push(t);
		histograms.push(
			histogram(ctx.getImageData(0, 0, canvas.width, canvas.height).data),
		);
		onProgress?.(t / clipSeconds);
	}
	video.removeAttribute("src");
	video.load();
	const cuts = findSceneCuts({ times, histograms }).filter(
		(t) => t > 0.2 && t < clipSeconds - 0.2,
	);
	if (cuts.length === 0) return 0;
	// Split from the end so earlier pieces keep the original element id.
	const commands = [...cuts].reverse().map(
		(t) =>
			new SplitElementsCommand({
				elements: [{ trackId, elementId: element.id }],
				splitTime: roundMediaTime({
					time: mediaTime({
						ticks: Math.round(element.startTime + t * TICKS_PER_SECOND),
					}),
				}),
			}),
	);
	editor.command.execute({ command: new BatchCommand(commands) });
	return cuts.length;
}

function saveBlob({ blob, name }: { blob: Blob; name: string }) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadSource({
	editor,
	clip,
}: {
	editor: EditorCore;
	clip: ClipRef;
}) {
	const asset = mediaOf({ editor, element: clip.element });
	if (!asset) return;
	saveBlob({ blob: asset.file, name: asset.name });
}

export async function downloadFrame({
	editor,
	clip,
}: {
	editor: EditorCore;
	clip: ClipRef;
}) {
	const time = editor.playback.getCurrentTime();
	const inside =
		time >= clip.element.startTime &&
		time < clip.element.startTime + clip.element.duration;
	const file = await captureClipFrame({
		editor,
		clip,
		timelineTime: inside ? time : clip.element.startTime,
	});
	saveBlob({ blob: file, name: file.name });
}

export function openTranscriptEditing() {
	useAssetsPanelStore.getState().setActiveTab("transcript");
}

/** Adds an image or video as an overlay above everything, at the playhead. */
export async function addOverlay({ editor }: { editor: EditorCore }) {
	const file = await pickFile("image/*,video/*");
	if (!file) return;
	const [asset] = await processMediaAssets({ files: [file] });
	if (!asset) return;
	const addMedia = new AddMediaAssetCommand({
		projectId: editor.project.getActive().metadata.id,
		asset,
	});
	const track = new AddTrackCommand({ type: "video", index: 0 });
	const element = buildElementFromMedia({
		mediaId: addMedia.getAssetId(),
		mediaType: asset.type,
		name: asset.name,
		duration: roundMediaTime({
			time: mediaTimeFromSeconds({
				seconds: asset.type === "image" ? 5 : (asset.duration ?? 5),
			}),
		}),
		startTime: editor.playback.getCurrentTime(),
	});
	editor.command.execute({
		command: new BatchCommand([
			addMedia,
			track,
			new InsertElementCommand({
				element: {
					...element,
					params: {
						...element.params,
						"transform.scaleX": 0.5,
						"transform.scaleY": 0.5,
					},
				},
				placement: { mode: "explicit", trackId: track.getTrackId() },
			}),
		]),
	});
}

/** Overlay ↔ main track, keeping the clip's time. */
export function moveClipTrack({
	editor,
	clip,
	to,
}: {
	editor: EditorCore;
	clip: ClipRef;
	to: "overlay" | "main";
}) {
	const { element, trackId } = clip;
	const tracks = editor.scenes.getActiveScene().tracks;
	if (to === "main") {
		if (trackId === tracks.main.id) return;
		const end = element.startTime + element.duration;
		const blocked = tracks.main.elements.some(
			(e) => e.startTime < end && e.startTime + e.duration > element.startTime,
		);
		if (blocked) {
			toast.error("The main track is busy at that time.");
			return;
		}
		editor.command.execute({
			command: new MoveElementCommand({
				moves: [
					{
						sourceTrackId: trackId,
						targetTrackId: tracks.main.id,
						elementId: element.id,
						newStartTime: element.startTime,
					},
				],
			}),
		});
		return;
	}
	const id = generateUUID();
	editor.command.execute({
		command: new MoveElementCommand({
			moves: [
				{
					sourceTrackId: trackId,
					targetTrackId: id,
					elementId: element.id,
					newStartTime: element.startTime,
				},
			],
			createTracks: [{ id, type: "video", index: 0 }],
		}),
	});
}
