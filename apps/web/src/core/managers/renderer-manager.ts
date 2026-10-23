import { savedTimelineGrade } from "@/color/grade-target";
import type { EditorCore } from "@/core";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import type { ExportOptions, ExportResult } from "@/export";
import {
	captionTracksToCues,
	cuesToVtt,
	isCaptionTrack,
} from "@/export/captions";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { SceneExporter } from "@/services/renderer/scene-exporter";
import { buildScene } from "@/services/renderer/scene-builder";
import { createTimelineAudioBuffer } from "@/media/audio";
import { formatTimecode } from "opencut-wasm";
import { frameRateToFloat } from "@/fps/utils";
import { downloadBlob } from "@/utils/browser";
import { masterBridge, type MasterExportBridge } from "@/export/master";
import type { Upscaler } from "@/ai-export/upscale";
import type { Interpolator } from "@/ai-export/interpolate";

/** Opens the AI models the export asked for (EX-20, EX-21). */
async function loadAiStages({
	ai,
}: {
	ai?: { upscale?: boolean; interpolate?: boolean };
}): Promise<{ upscaler?: Upscaler; interpolator?: Interpolator }> {
	if (!ai?.upscale && !ai?.interpolate) return {};
	const { readModel, modelFor } = await import("@/ai-export/models");
	const stages: { upscaler?: Upscaler; interpolator?: Interpolator } = {};
	if (ai.upscale) {
		const bytes = await readModel(modelFor("upscale").id);
		if (!bytes) throw new Error("Download the AI Ultra HD model in Settings → Local models first.");
		const { Upscaler } = await import("@/ai-export/upscale");
		stages.upscaler = await Upscaler.create(bytes);
	}
	if (ai.interpolate) {
		const bytes = await readModel(modelFor("interpolate").id);
		if (!bytes) throw new Error("Download the optical flow model in Settings → Local models first.");
		const { Interpolator } = await import("@/ai-export/interpolate");
		stages.interpolator = await Interpolator.create(bytes);
	}
	return stages;
}

type SnapshotResult =
	| { success: true; blob: Blob; filename: string }
	| { success: false; error: string };

export class RendererManager {
	private renderTree: RootNode | null = null;
	private _isDegraded = false;
	private listeners = new Set<() => void>();

	constructor(private editor: EditorCore) {}

	get isDegraded(): boolean {
		return this._isDegraded;
	}

	setDegraded(degraded: boolean): void {
		if (this._isDegraded === degraded) return;
		this._isDegraded = degraded;
		this.notify();
	}

	setRenderTree({ renderTree }: { renderTree: RootNode | null }): void {
		this.renderTree = renderTree;
		this.notify();
	}

	getRenderTree(): RootNode | null {
		return this.renderTree;
	}

	async saveSnapshot(): Promise<{ success: boolean; error?: string }> {
		const snapshot = await this.createSnapshot();
		if (!snapshot.success) {
			return snapshot;
		}

		downloadBlob({ blob: snapshot.blob, filename: snapshot.filename });
		return { success: true };
	}

	async copySnapshot(): Promise<{ success: boolean; error?: string }> {
		if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
			return {
				success: false,
				error: "Clipboard image copy is not supported in this browser",
			};
		}

		const snapshot = await this.createSnapshot();
		if (!snapshot.success) {
			return snapshot;
		}

		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					[snapshot.blob.type || "image/png"]: snapshot.blob,
				}),
			]);
			return { success: true };
		} catch (error) {
			console.error("Copy snapshot failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	private async createSnapshot(): Promise<SnapshotResult> {
		try {
			const renderTree = this.getRenderTree();
			const activeProject = this.editor.project.getActive();

			if (!renderTree || !activeProject) {
				return { success: false, error: "No project or scene to capture" };
			}

			const duration = this.editor.timeline.getTotalDuration();
			if (duration === 0) {
				return { success: false, error: "Project is empty" };
			}

			const { canvasSize, fps } = activeProject.settings;
			const renderTime = Math.min(
				this.editor.playback.getCurrentTime(),
				this.editor.timeline.getLastFrameTime(),
			);

			const renderer = new CanvasRenderer({
				width: canvasSize.width,
				height: canvasSize.height,
				fps,
			});
			// Stills you keep use the original media, not proxies.
			renderer.useProxies = false;

			const tempCanvas = document.createElement("canvas");
			tempCanvas.width = canvasSize.width;
			tempCanvas.height = canvasSize.height;

			await renderer.renderToCanvas({
				node: renderTree,
				time: renderTime,
				targetCanvas: tempCanvas,
			});

			const blob = await new Promise<Blob | null>((resolve) => {
				tempCanvas.toBlob((result) => resolve(result), "image/png");
			});

			if (!blob) {
				return { success: false, error: "Failed to create image" };
			}

			const timecode = formatTimecode({ time: renderTime, rate: fps })!.replace(
				/:/g,
				"-",
			);
			const safeName =
				activeProject.metadata.name.replace(/[<>:"/\\|?*]/g, "-").trim() ||
				"snapshot";
			const filename = `${safeName}-${timecode}.png`;

			return { success: true, blob, filename };
		} catch (error) {
			console.error("Snapshot capture failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	async exportProject({
		options,
		onProgress,
		onCancel,
	}: {
		options: ExportOptions;
		onProgress?: ({ progress }: { progress: number }) => void;
		onCancel?: () => boolean;
	}): Promise<ExportResult> {
		const {
			format,
			quality,
			fps,
			includeAudio,
			codec,
			resolution,
			burnInCaptions = true,
			embedCaptions = false,
			videoBitrate,
			coverImage,
			forceSdr = false,
			gif,
			master,
			ai,
		} = options;
		let aiStages: Awaited<ReturnType<typeof loadAiStages>> = {};
		const bridge: MasterExportBridge | null = master ? masterBridge() : null;
		if (master && !bridge)
			return { success: false, error: "ProRes and FFV1 need the desktop app." };

		try {
			aiStages = await loadAiStages({ ai });
			const allTracks = this.editor.scenes.getActiveScene().tracks;
			const captionCues = captionTracksToCues([
				...allTracks.overlay,
				allTracks.main,
				...allTracks.audio,
			]);
			const tracks = burnInCaptions
				? allTracks
				: {
						...allTracks,
						overlay: allTracks.overlay.filter(
							(track) => !isCaptionTrack(track),
						),
					};
			const mediaAssets = this.editor.media.getAssets();
			const activeProject = this.editor.project.getActive();

			if (!activeProject) {
				return { success: false, error: "No active project" };
			}

			const duration = this.editor.timeline.getTotalDuration();
			if (duration === 0) {
				return { success: false, error: "Project is empty" };
			}

			const exportFps = fps ?? activeProject.settings.fps;
			const colorSpace = activeProject.settings.colorSpace ?? "rec709";
			const canvasSize = activeProject.settings.canvasSize;

			let audioBuffer: AudioBuffer | null = null;
			if (includeAudio && format !== "gif") {
				onProgress?.({ progress: 0.05 });
				audioBuffer = await createTimelineAudioBuffer({
					tracks,
					mediaAssets,
					duration,
					sampleRate: activeProject.settings.audio?.sampleRate,
					channels: activeProject.settings.audio?.channels,
				});
			}

			const scene = buildScene({
				grade: savedTimelineGrade(this.editor.scenes.getActiveScene().grade),
				tracks,
				mediaAssets,
				duration,
				canvasSize,
				background: activeProject.settings.background,
			});

			const exporter = new SceneExporter({
				width: canvasSize.width,
				height: canvasSize.height,
				fps: exportFps,
				format,
				quality,
				shouldIncludeAudio: !!includeAudio,
				audioBuffer: audioBuffer || undefined,
				codec,
				outputSize: resolution,
				videoBitrate,
				coverImage,
				// HDR projects export 10-bit VP9 with HLG/PQ signalling (HD-14).
				hdrOutput:
					!forceSdr &&
					format === "webm" &&
					(colorSpace === "hlg" || colorSpace === "pq")
						? colorSpace
						: undefined,
				subtitlesVtt:
					embedCaptions && captionCues[0]?.length
						? cuesToVtt(captionCues[0])
						: undefined,
				gif,
				...(master && bridge ? { master: { bridge, codec: master } } : {}),
				ai: aiStages,
			});

			exporter.on("progress", (progress) => {
				const adjustedProgress = includeAudio
					? 0.05 + progress * 0.95
					: progress;
				onProgress?.({ progress: adjustedProgress });
			});

			let cancelled = false;
			const checkCancel = () => {
				if (onCancel?.()) {
					cancelled = true;
					exporter.cancel();
				}
			};

			const cancelInterval = setInterval(checkCancel, 100);

			try {
				const buffer = await exporter.export({ rootNode: scene });
				clearInterval(cancelInterval);

				if (cancelled) {
					return { success: false, cancelled: true };
				}

				if (!buffer) {
					return { success: false, error: "Export failed to produce buffer" };
				}

				return {
					success: true,
					buffer,
					captions: captionCues.flat().sort((a, b) => a.start - b.start),
					...(exporter.masterJobId ? { masterJobId: exporter.masterJobId } : {}),
				};
			} finally {
				clearInterval(cancelInterval);
				aiStages.upscaler?.release();
				aiStages.interpolator?.release();
			}
		} catch (error) {
			console.error("Export failed:", error);
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: String(error) || "Unknown export error",
			};
		}
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		this.listeners.forEach((fn) => {
			fn();
		});
	}
}
