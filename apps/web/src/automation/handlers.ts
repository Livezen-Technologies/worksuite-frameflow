import type { EditorCore } from "@/core";
import { EXPORT_FORMAT_VALUES, EXPORT_QUALITY_VALUES } from "@/export";
import { floatToFrameRate, frameRateToFloat } from "@/fps/utils";
import { processMediaAssets } from "@/media/processing";
import { storageService } from "@/services/storage/service";
import { syncProject } from "@/cloud/sync";
import { initializeGpuRenderer } from "@/services/renderer/gpu-renderer";
import {
	buildElementFromMedia,
	buildTextElement,
} from "@/timeline/element-utils";
import { defaultStillDuration } from "@/timeline/creation";
import { mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";
import { asRecord, AutomationError, num, oneOf, str } from "./params";

/**
 * Editor side of the automation API. Each method takes plain JSON and
 * returns plain JSON (times in seconds), never tokens or file contents.
 */

export interface AutomationContext {
	editor: EditorCore;
	/** Navigate the window (Next router) and wait for the project to load. */
	openProject: (id: string) => Promise<void>;
}

const seconds = (ticks: number) =>
	Math.round((ticks / TICKS_PER_SECOND) * 1000) / 1000;

function activeProject(editor: EditorCore) {
	const project = editor.project.getActiveOrNull();
	if (!project)
		throw new AutomationError({
			message: "No project is open. Call project.open or project.create first.",
			code: -32004,
		});
	return project;
}

function describeProject(editor: EditorCore) {
	const project = activeProject(editor);
	return {
		id: project.metadata.id,
		name: project.metadata.name,
		width: project.settings.canvasSize.width,
		height: project.settings.canvasSize.height,
		fps: frameRateToFloat(project.settings.fps),
		duration: seconds(editor.timeline.getTotalDuration()),
	};
}

type Handler = (args: {
	ctx: AutomationContext;
	params: Record<string, unknown>;
}) => Promise<unknown>;

export const HANDLERS: Record<string, Handler> = {
	"project.list": async () => {
		const projects = await storageService.loadAllProjectsMetadata();
		return projects.map((p) => ({
			id: p.id,
			name: p.name,
			duration: p.duration,
			updatedAt:
				p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
		}));
	},

	"project.current": async ({ ctx: { editor } }) =>
		editor.project.getActiveOrNull() ? describeProject(editor) : null,

	"project.create": async ({ ctx: { editor, openProject }, params }) => {
		const name = str({ params, key: "name" }) ?? "New project";
		const width = num({ params, key: "width", min: 16, max: 16384 });
		const height = num({ params, key: "height", min: 16, max: 16384 });
		const fps = num({ params, key: "fps", min: 1, max: 240 });
		const id = await editor.project.createNewProject({
			name,
			settings: {
				...(width && height
					? {
							canvasSize: {
								width: Math.round(width),
								height: Math.round(height),
							},
							canvasSizeMode: "custom" as const,
						}
					: {}),
				...(fps ? { fps: floatToFrameRate(fps) } : {}),
			},
		});
		await openProject(id);
		return describeProject(editor);
	},

	"project.open": async ({ ctx: { editor, openProject }, params }) => {
		const id = str({ params, key: "id", required: true }) ?? "";
		if (!(await storageService.getSerializedProject({ id })))
			throw new AutomationError({
				message: `No project with id ${id}`,
				code: -32004,
			});
		await openProject(id);
		return describeProject(editor);
	},

	"project.rename": async ({ ctx: { editor }, params }) => {
		const name = str({ params, key: "name", required: true }) ?? "";
		const project = activeProject(editor);
		await editor.project.renameProject({ id: project.metadata.id, name });
		return describeProject(editor);
	},

	"media.list": async ({ ctx: { editor } }) => {
		activeProject(editor);
		return editor.media.getAssets().map((a) => ({
			id: a.id,
			name: a.name,
			type: a.type,
			duration: a.duration ?? null,
			width: a.width ?? null,
			height: a.height ?? null,
		}));
	},

	"media.import": async ({ ctx: { editor }, params }) => {
		const project = activeProject(editor);
		const raw = params.files;
		if (!Array.isArray(raw))
			throw new AutomationError({ message: "files missing", code: -32602 });
		const files = raw.map((f) => {
			const item = asRecord(f);
			if (!(item.data instanceof ArrayBuffer))
				throw new AutomationError({ message: "bad file", code: -32602 });
			return new File([item.data], String(item.name), {
				type: typeof item.type === "string" ? item.type : "",
				lastModified:
					typeof item.lastModified === "number"
						? item.lastModified
						: Date.now(),
			});
		});
		const processed = await processMediaAssets({ files });
		const added = [];
		for (const asset of processed) {
			const saved = await editor.media.addMediaAsset({
				projectId: project.metadata.id,
				asset,
			});
			if (saved)
				added.push({
					id: saved.id,
					name: saved.name,
					type: saved.type,
					duration: saved.duration ?? null,
				});
		}
		if (!added.length)
			throw new AutomationError({
				message: "None of the files could be imported",
			});
		return added;
	},

	"timeline.list": async ({ ctx: { editor } }) => {
		activeProject(editor);
		const { tracks } = editor.scenes.getActiveScene();
		const all = [
			{ kind: "main", track: tracks.main },
			...tracks.overlay.map((track) => ({ kind: "overlay", track })),
			...tracks.audio.map((track) => ({ kind: "audio", track })),
		];
		return all.map(({ kind, track }) => ({
			id: track.id,
			kind,
			type: track.type,
			elements: track.elements.map((e) => ({
				id: e.id,
				type: e.type,
				name: e.name,
				start: seconds(e.startTime),
				duration: seconds(e.duration),
				...("mediaId" in e ? { mediaId: e.mediaId } : {}),
				...(e.type === "text" ? { text: e.params.content } : {}),
			})),
		}));
	},

	"timeline.addMedia": async ({ ctx: { editor }, params }) => {
		activeProject(editor);
		const mediaId = str({ params, key: "mediaId", required: true });
		const asset = editor.media.getAssets().find((a) => a.id === mediaId);
		if (!asset)
			throw new AutomationError({
				message: `No media with id ${mediaId}`,
				code: -32004,
			});
		const start =
			num({ params, key: "start", min: 0 }) ??
			seconds(editor.timeline.getTotalDuration());
		const length = num({ params, key: "duration", min: 0.04 });
		const duration = length
			? mediaTimeFromSeconds({ seconds: length })
			: asset.duration != null
				? mediaTimeFromSeconds({ seconds: asset.duration })
				: defaultStillDuration();
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: asset.name,
			duration,
			startTime: mediaTimeFromSeconds({ seconds: start }),
		});
		editor.timeline.insertElement({ element, placement: { mode: "auto" } });
		return { mediaId: asset.id, start, duration: seconds(duration) };
	},

	"timeline.addText": async ({ ctx: { editor }, params }) => {
		activeProject(editor);
		const text = str({ params, key: "text", required: true }) ?? "";
		const start = num({ params, key: "start", min: 0 }) ?? 0;
		const duration = num({ params, key: "duration", min: 0.04 }) ?? 3;
		const element = buildTextElement({
			raw: {
				name: text.slice(0, 40),
				params: { content: text },
				duration: mediaTimeFromSeconds({ seconds: duration }),
			},
			startTime: mediaTimeFromSeconds({ seconds: start }),
		});
		editor.timeline.insertElement({ element, placement: { mode: "auto" } });
		return { text, start, duration };
	},

	"playback.seek": async ({ ctx: { editor }, params }) => {
		activeProject(editor);
		const at = num({ params, key: "seconds", min: 0 }) ?? 0;
		editor.playback.seek({ time: mediaTimeFromSeconds({ seconds: at }) });
		return { seconds: at };
	},

	"export.run": async ({ ctx: { editor }, params }) => {
		activeProject(editor);
		const format =
			oneOf({ params, key: "format", values: EXPORT_FORMAT_VALUES }) ?? "mp4";
		const quality =
			oneOf({ params, key: "quality", values: EXPORT_QUALITY_VALUES }) ??
			"high";
		const width = num({ params, key: "width", min: 16, max: 16384 });
		const height = num({ params, key: "height", min: 16, max: 16384 });
		if (!editor.timeline.getTotalDuration())
			throw new AutomationError({ message: "The timeline is empty" });
		// The editor page sets the GPU up as it mounts; a call can arrive first.
		await initializeGpuRenderer();
		const result = await editor.project.export({
			options: {
				format,
				quality,
				fps: activeProject(editor).settings.fps,
				...(format === "gif"
					? {}
					: { codec: format === "webm" ? ("vp9" as const) : ("avc" as const) }),
				includeAudio: params.includeAudio !== false,
				...(width && height
					? {
							resolution: {
								width: Math.round(width),
								height: Math.round(height),
							},
						}
					: {}),
			},
		});
		if (!result.success || !result.buffer)
			throw new AutomationError({
				message: result.cancelled
					? "Export cancelled"
					: (result.error ?? "Export failed"),
			});
		return { buffer: result.buffer };
	},

	"cloud.sync": async ({ ctx: { editor }, params }) => {
		const id =
			str({ params, key: "projectId" }) ?? activeProject(editor).metadata.id;
		await syncProject({ projectId: id });
		return { projectId: id, synced: true };
	},
};

export async function handleAutomationCall({
	ctx,
	method,
	params,
}: {
	ctx: AutomationContext;
	method: string;
	params: unknown;
}): Promise<unknown> {
	const handler = HANDLERS[method];
	if (!handler)
		throw new AutomationError({
			message: `Unknown method: ${method}`,
			code: -32601,
		});
	return handler({ ctx, params: asRecord(params) });
}
