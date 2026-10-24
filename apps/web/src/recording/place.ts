"use client";

import { DEFAULT_SCREEN_STYLE } from "@/screen-style/types";
import type { CursorLog } from "@/screen-zoom/types";
import { DEFAULT_ZOOM_SETTINGS } from "@/screen-zoom/types";
import { generateZooms } from "@/screen-zoom/generate";
import { BatchCommand, Command, type CommandResult } from "@/commands";
import { AddMediaAssetCommand } from "@/commands/media";
import { AddTrackCommand, InsertElementCommand } from "@/commands/timeline";
import { EditorCore } from "@/core";
import { buildDefaultMaskInstance } from "@/masks";
import type { ParamValues } from "@/params";
import { processMediaAssets } from "@/media/processing";
import type { Bookmark, TScene } from "@/timeline";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { updateSceneInArray } from "@/timeline/scenes";
import { mediaTimeFromSeconds, roundMediaTime } from "@/wasm";
import { ApplyTracksCommand } from "@/commands/timeline/apply-tracks";
import { generateUUID } from "@/utils/id";
import { cropLog } from "./area";
import { punchIn } from "./punch";
import { type CameraOverlay, DEFAULT_CAMERA_OVERLAY, useRecordingSettings } from "./settings";
import type { RecordedFile, SessionManifest } from "./storage";

/** Adds the take's markers as timeline bookmarks (SC-36), undoable. */
class AddBookmarksCommand extends Command {
	private savedScenes: TScene[] | null = null;

	constructor(private readonly bookmarks: Bookmark[]) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const scene = editor.scenes.getActiveScene();
		const scenes = editor.scenes.getScenes();
		this.savedScenes = [...scenes];
		editor.scenes.setScenes({
			scenes: updateSceneInArray({
				scenes,
				sceneId: scene.id,
				updates: { bookmarks: [...scene.bookmarks, ...this.bookmarks] },
			}),
		});
		return undefined;
	}

	undo(): void {
		if (this.savedScenes) {
			EditorCore.getInstance().scenes.setScenes({ scenes: this.savedScenes });
		}
	}
}

/**
 * Puts a finished take on the timeline as one undo step: the screen on its
 * own video track, the camera above it as a picture-in-picture overlay
 * (editable afterwards, SC-20), and the mic on an audio track (AR-01).
 */
export async function placeRecording({
	editor,
	session,
	files,
	cursorLog = null,
	autoZoom = true,
	cleanCursor = false,
}: {
	/** The system cursor was left out; draw one from the log (SC-15). */
	cleanCursor?: boolean;
	editor: EditorCore;
	session: SessionManifest;
	files: RecordedFile[];
	/** Cursor and click log for the screen track (SC-06). */
	cursorLog?: CursorLog | null;
	/** Turn clicks and typing into zooms (SC-11). */
	autoZoom?: boolean;
}): Promise<number> {
	const project = editor.project.getActive();
	const startTime = roundMediaTime({
		time: mediaTimeFromSeconds({ seconds: session.timelineStart }),
	});
	const commands: Command[] = [];
	const look = useRecordingSettings.getState();
	const zoomSettings = { ...DEFAULT_ZOOM_SETTINGS, level: look.zoomLevel ?? DEFAULT_ZOOM_SETTINGS.level, follow: look.zoomFollow ?? true };
	// Overlays go above: insert the camera's track first at index 0.
	const order = ["camera", "screen", "mic"] as const;
	const sorted = [...files].sort(
		(a, b) => order.indexOf(a.role) - order.indexOf(b.role),
	);
	const hasScreen = files.some((f) => f.role === "screen");
	if (cursorLog && session.area) cursorLog = cropLog({ log: cursorLog, area: session.area });
	let placed = 0;
	for (const recorded of sorted) {
		const [asset] = await processMediaAssets({ files: [recorded.file] });
		if (!asset) continue;
		// MediaRecorder output can lack a duration; the session clock knows it.
		const seconds =
			asset.duration && Number.isFinite(asset.duration) && asset.duration > 0
				? asset.duration
				: session.duration;
		const addMedia = new AddMediaAssetCommand({
			projectId: project.metadata.id,
			asset: { ...asset, duration: seconds },
		});
		commands.push(addMedia);
		const element = buildElementFromMedia({
			mediaId: addMedia.getAssetId(),
			mediaType: asset.type,
			name: recorded.label,
			duration: roundMediaTime({
				time: mediaTimeFromSeconds({ seconds }),
			}),
			startTime,
		});
		const punched =
			recorded.role === "mic" && session.punch && element.type === "audio" && element.sourceType === "upload"
				? punchIn({
						tracks: editor.scenes.getActiveScene().tracks,
						start: mediaTimeFromSeconds({ seconds: session.punch.start }),
						end: mediaTimeFromSeconds({ seconds: session.punch.end }),
						take: { element: { ...element, id: generateUUID() }, length: element.duration },
						makeId: generateUUID,
					})
				: null;
		if (punched) {
			commands.push(new ApplyTracksCommand(punched.tracks));
		} else if (recorded.role === "mic") {
			commands.push(
				new InsertElementCommand({
					element,
					placement: { mode: "auto", trackType: "audio" },
				}),
			);
		} else {
			const track = new AddTrackCommand({ type: "video", index: 0 });
			commands.push(track);
			const pip =
				recorded.role === "camera" && hasScreen
					? cameraOverlay({
							element,
							frame: project.settings.canvasSize,
							image: { width: asset.width ?? 1280, height: asset.height ?? 720 },
							overlay: look.camera,
						})
					: recorded.role === "screen" && cursorLog
						? {
								...element,
								...(cleanCursor
									? {
											screenStyle: {
												...DEFAULT_SCREEN_STYLE,
												cursor: { ...DEFAULT_SCREEN_STYLE.cursor, enabled: true, rippleColor: look.clickColor },
											},
										}
									: {}),
								screenZoom: {
									settings: zoomSettings,
									log: cursorLog,
									segments: autoZoom
										? generateZooms({
												log: cursorLog,
												duration: seconds,
												settings: zoomSettings,
											})
										: [],
								},
							}
						: element;
			commands.push(
				new InsertElementCommand({
					element: pip,
					placement: { mode: "explicit", trackId: track.getTrackId() },
				}),
			);
		}
		placed++;
	}
	if (session.markers.length > 0) {
		commands.push(
			new AddBookmarksCommand(
				session.markers.map((m, i) => ({
					time: roundMediaTime({
						time: mediaTimeFromSeconds({ seconds: session.timelineStart + m }),
					}),
					note: `Marker ${i + 1}`,
				})),
			),
		);
	}
	if (commands.length > 0) {
		editor.command.execute({ command: new BatchCommand(commands) });
	}
	return placed;
}

const CORNER_RADIUS = { circle: 0.5, rounded: 0.18, square: 0, original: 0 } as const;

/**
 * The camera as a picture-in-picture: cut to a circle, rounded or square
 * shape with an optional border, sized and parked in a corner (SC-20).
 */
function cameraOverlay<T extends { params: ParamValues }>({
	element,
	frame,
	image,
	overlay = DEFAULT_CAMERA_OVERLAY,
}: {
	element: T;
	frame: { width: number; height: number };
	image: { width: number; height: number };
	overlay?: CameraOverlay;
}): T {
	const shaped = overlay.shape !== "original";
	const contain = Math.min(frame.width / image.width, frame.height / image.height);
	// Shaped cameras keep a centred square the height of the picture.
	const visibleW = (shaped ? Math.min(image.width, image.height) : image.width) * contain;
	const visibleH = (shaped ? Math.min(image.width, image.height) : image.height) * contain;
	const scale = ((Math.min(50, Math.max(8, overlay.size)) / 100) * frame.width) / visibleW;
	const margin = Math.round(frame.height * 0.04);
	const x = frame.width / 2 - margin - (visibleW * scale) / 2;
	const y = frame.height / 2 - margin - (visibleH * scale) / 2;
	const placed = {
		...element,
		params: {
			...element.params,
			"transform.scaleX": scale,
			"transform.scaleY": scale,
			"transform.positionX": Math.round(overlay.corner.endsWith("left") ? -x : x),
			"transform.positionY": Math.round(overlay.corner.startsWith("top") ? -y : y),
		},
	};
	if (!shaped && overlay.border <= 0) return placed;
	const side = Math.min(image.width, image.height);
	const mask = buildDefaultMaskInstance({ maskType: "rectangle", elementSize: image });
	if (mask.type === "rectangle") {
		mask.params = {
			...mask.params,
			width: shaped ? side / image.width : 1,
			height: shaped ? side / image.height : 1,
			cornerRadius: CORNER_RADIUS[overlay.shape],
			strokeWidth: Math.max(0, overlay.border) / (contain * scale),
			strokeColor: "#ffffff",
			strokeAlign: "inside",
		};
	}
	return { ...placed, masks: [mask] };
}
