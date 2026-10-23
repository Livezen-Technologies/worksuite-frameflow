import type { EditorCore } from "@/core";
import type { ExportCodec } from "@/export";
import { evenSize } from "@/export/presets";
import { frameRateToFloat } from "@/fps/utils";
import { buildScene } from "@/services/renderer/scene-builder";
import { SceneExporter } from "@/services/renderer/scene-exporter";
import { OPFSAdapter } from "@/services/storage/opfs-adapter";
import type { SceneTracks } from "@/timeline/types";
import { TICKS_PER_SECOND } from "@/wasm";
import {
	segmentAt,
	segmentFingerprint,
	segmentsFor,
	type Segment,
} from "./segments";
import { useRenderCacheSettings, useRenderCacheStatus } from "./store";

/** Bumped when rendering changes in a way old renders don't reflect. */
const RENDER_VERSION = "1";

export interface CachedFrame {
	mediaId: string;
	file: File;
	/** Seconds into the cached segment. */
	seconds: number;
}

class RenderCacheService {
	private projectId: string | null = null;
	private files = new Map<string, File>();
	private storage: OPFSAdapter | null = null;
	private fingerprints = new WeakMap<SceneTracks, Map<number, string>>();
	private settingsKey = "";
	private exporter: SceneExporter | null = null;
	private cancelled = false;
	private codec: ExportCodec | null = null;

	/** Load what's on disk for a project (called when it opens). */
	async open({ projectId }: { projectId: string }) {
		if (projectId === this.projectId) return;
		this.cancel();
		this.projectId = projectId;
		this.files = new Map();
		this.fingerprints = new WeakMap();
		this.storage = new OPFSAdapter(`render-cache-${projectId}`);
		const keys = await this.storage.list().catch(() => [] as string[]);
		for (const key of keys) {
			const file = await this.storage.get(key);
			if (file && this.projectId === projectId) this.files.set(key, file);
		}
	}

	private context(editor: EditorCore) {
		const project = editor.project.getActiveOrNull();
		if (!project || project.metadata.id !== this.projectId) return null;
		const fps = frameRateToFloat(project.settings.fps);
		// Same rounding as the preview and the exporter, so frame numbers agree.
		const rate = project.settings.fps;
		const ticksPerFrame = Math.round(
			(TICKS_PER_SECOND * rate.denominator) / rate.numerator,
		);
		const totalFrames = Math.floor(
			editor.timeline.getTotalDuration() / ticksPerFrame,
		);
		const { quality } = useRenderCacheSettings.getState();
		const extra = `${RENDER_VERSION}:${quality}`;
		return {
			project,
			fps,
			ticksPerFrame,
			totalFrames,
			extra,
			tracks: editor.scenes.getActiveScene().tracks,
		};
	}

	/** Fingerprint for one segment, memoised per timeline state. */
	private fingerprint({
		editor,
		segment,
	}: {
		editor: EditorCore;
		segment: Segment;
	}): string | null {
		const ctx = this.context(editor);
		if (!ctx) return null;
		const key = `${JSON.stringify(ctx.project.settings)}|${ctx.extra}`;
		if (key !== this.settingsKey) {
			this.settingsKey = key;
			this.fingerprints = new WeakMap();
		}
		let byIndex = this.fingerprints.get(ctx.tracks);
		if (!byIndex) {
			byIndex = new Map();
			this.fingerprints.set(ctx.tracks, byIndex);
		}
		let hash = byIndex.get(segment.index);
		if (!hash) {
			hash = segmentFingerprint({
				tracks: ctx.tracks,
				settings: ctx.project.settings,
				startTicks: (segment.startFrame - 1) * ctx.ticksPerFrame,
				endTicks: (segment.endFrame + 1) * ctx.ticksPerFrame,
				extra: `${ctx.extra}:${segment.startFrame}-${segment.endFrame}`,
			});
			byIndex.set(segment.index, hash);
		}
		return hash;
	}

	/** The cached picture for a frame, if that part of the timeline is rendered and unchanged. */
	lookup({
		editor,
		frame,
	}: {
		editor: EditorCore;
		frame: number;
	}): CachedFrame | null {
		if (useRenderCacheSettings.getState().mode === "off" || !this.files.size)
			return null;
		const ctx = this.context(editor);
		if (!ctx || frame >= ctx.totalFrames) return null;
		const segment = segmentsFor({ totalFrames: ctx.totalFrames, fps: ctx.fps })[
			segmentAt({ frame, fps: ctx.fps })
		];
		if (!segment) return null;
		const hash = this.fingerprint({ editor, segment });
		const file = hash ? this.files.get(hash) : undefined;
		if (!hash || !file) return null;
		return {
			mediaId: `render-cache:${hash}`,
			file,
			seconds: (frame - segment.startFrame) / ctx.fps,
		};
	}

	/** Cached/stale state of every segment, for the timeline strip. */
	status({ editor }: { editor: EditorCore }): ("cached" | "stale")[] {
		const ctx = this.context(editor);
		if (!ctx) return [];
		return segmentsFor({ totalFrames: ctx.totalFrames, fps: ctx.fps }).map(
			(segment) => {
				const hash = this.fingerprint({ editor, segment });
				return hash && this.files.has(hash) ? "cached" : "stale";
			},
		);
	}

	private async pickCodec(size: {
		width: number;
		height: number;
	}): Promise<ExportCodec> {
		if (this.codec) return this.codec;
		const avc =
			typeof VideoEncoder !== "undefined" &&
			(
				await VideoEncoder.isConfigSupported({
					codec: "avc1.640028",
					...size,
				}).catch(() => ({ supported: false }))
			).supported;
		this.codec = avc ? "avc" : "vp9";
		return this.codec;
	}

	/** Render every stale segment, then drop renders the timeline no longer uses. */
	async renderStale({
		editor,
	}: {
		editor: EditorCore;
	}): Promise<{ rendered: number }> {
		const ctx = this.context(editor);
		if (!ctx || !this.storage || this.exporter) return { rendered: 0 };
		const projectId = this.projectId;
		this.cancelled = false;
		const segments = segmentsFor({
			totalFrames: ctx.totalFrames,
			fps: ctx.fps,
		});
		const wanted = new Map<string, Segment>();
		for (const segment of segments) {
			const hash = this.fingerprint({ editor, segment });
			if (hash) wanted.set(hash, segment);
		}
		const todo = [...wanted].filter(([hash]) => !this.files.has(hash));
		const { quality } = useRenderCacheSettings.getState();
		const { canvasSize, background, fps } = ctx.project.settings;
		const outputSize = evenSize({
			width: Math.max(2, Math.round(canvasSize.width * quality)),
			height: Math.max(2, Math.round(canvasSize.height * quality)),
		});
		const codec = await this.pickCodec(outputSize);
		const status = useRenderCacheStatus.getState();
		let rendered = 0;
		try {
			for (const [index, [hash, segment]] of todo.entries()) {
				if (this.cancelled || this.projectId !== projectId) break;
				status.update({ rendering: { done: index, total: todo.length } });
				const duration = editor.timeline.getTotalDuration();
				const scene = buildScene({
					tracks: ctx.tracks,
					mediaAssets: editor.media.getAssets(),
					duration,
					canvasSize,
					background,
				});
				this.exporter = new SceneExporter({
					width: canvasSize.width,
					height: canvasSize.height,
					fps,
					format: codec === "avc" ? "mp4" : "webm",
					quality: "high",
					codec,
					outputSize,
				});
				const buffer = await this.exporter.export({
					rootNode: scene,
					range: { startFrame: segment.startFrame, endFrame: segment.endFrame },
				});
				this.exporter = null;
				if (!buffer || this.projectId !== projectId) continue;
				const file = new File(
					[buffer],
					`${hash}.${codec === "avc" ? "mp4" : "webm"}`,
					{
						type: codec === "avc" ? "video/mp4" : "video/webm",
					},
				);
				await this.storage.set({ key: hash, value: file });
				this.files.set(hash, file);
				rendered++;
				status.update({ segments: this.status({ editor }) });
			}
			if (!this.cancelled && this.projectId === projectId) {
				// The timeline moved on from these; free the space.
				for (const hash of [...this.files.keys()]) {
					if (wanted.has(hash)) continue;
					this.files.delete(hash);
					await this.storage.remove(hash).catch(() => {});
				}
			}
		} finally {
			this.exporter = null;
			status.update({ rendering: null, segments: this.status({ editor }) });
		}
		return { rendered };
	}

	isRendering() {
		return !!this.exporter || !!useRenderCacheStatus.getState().rendering;
	}

	cancel() {
		this.cancelled = true;
		this.exporter?.cancel();
	}

	async clear() {
		this.cancel();
		this.files.clear();
		await this.storage?.clear().catch(() => {});
	}
}

export const renderCache = new RenderCacheService();
