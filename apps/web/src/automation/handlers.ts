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
import { aiCleanUp, aiTranslate } from "@/ai/tasks";
import { buildSubtitlesFromTranscript } from "@/transcript/build";
import { exportTranscript, importTranscript } from "@/transcript/format";
import { generateTranscript } from "@/transcript/generate";
import { useTranscriptStore } from "@/transcript/store";
import { updateSegmentText } from "@/transcript/transcript";
import type { Transcript } from "@/transcript/types";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";

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

function currentTranscript(editor: EditorCore) {
	const projectId = activeProject(editor).metadata.id;
	return { projectId, transcript: useTranscriptStore.getState().byProject[projectId] ?? null };
}

function requireTranscript(editor: EditorCore) {
	const found = currentTranscript(editor);
	if (!found.transcript)
		throw new AutomationError({
			message: "This project has no transcript. Call transcript.generate or transcript.import first.",
			code: -32004,
		});
	return { projectId: found.projectId, transcript: found.transcript };
}

function saveTranscript({ projectId, transcript }: { projectId: string; transcript: Transcript }) {
	useTranscriptStore.getState().setTranscript({ projectId, transcript });
}

function describeTranscript(transcript: Transcript) {
	return {
		language: transcript.language,
		engine: transcript.engine,
		segments: transcript.segments.map((s) => ({
			id: s.id,
			start: s.start,
			end: s.end,
			text: s.text,
			verified: s.verified,
		})),
	};
}

const LANGUAGE_CODES = ["auto", ...TRANSCRIPTION_LANGUAGES.map((l) => l.code)] as const;

/** Captions and AI (SRS AU-01): the transcript-first caption workflow, scripted. */
const CAPTION_HANDLERS: Record<string, Handler> = {
	"transcript.get": async ({ ctx: { editor } }) => {
		const { transcript } = currentTranscript(editor);
		return transcript ? describeTranscript(transcript) : null;
	},

	"transcript.generate": async ({ ctx: { editor }, params }) => {
		const { projectId } = currentTranscript(editor);
		if (!editor.timeline.getTotalDuration())
			throw new AutomationError({ message: "The timeline is empty" });
		const transcript = await generateTranscript({
			editor,
			language: oneOf({ params, key: "language", values: LANGUAGE_CODES }) ?? "auto",
			engine: oneOf({ params, key: "engine", values: ["local", "gemini"] as const }) ?? "local",
			narrationTrackId: str({ params, key: "narrationTrackId" }) ?? null,
		});
		if (!transcript.segments.length)
			throw new AutomationError({ message: "No speech was found in the timeline audio" });
		saveTranscript({ projectId, transcript });
		return describeTranscript(transcript);
	},

	"transcript.setText": async ({ ctx: { editor }, params }) => {
		const { projectId, transcript } = requireTranscript(editor);
		const id = str({ params, key: "id", required: true }) ?? "";
		if (!transcript.segments.some((s) => s.id === id))
			throw new AutomationError({ message: `No segment with id ${id}`, code: -32004 });
		const next = updateSegmentText({ transcript, id, text: str({ params, key: "text", required: true }) ?? "" });
		saveTranscript({ projectId, transcript: next });
		return describeTranscript(next);
	},

	"transcript.import": async ({ ctx: { editor }, params }) => {
		const { projectId, transcript } = currentTranscript(editor);
		const format = oneOf({ params, key: "format", values: ["srt", "vtt", "ass", "json", "txt"] as const }) ?? "srt";
		let next: Transcript;
		try {
			next = importTranscript({
				fileName: `import.${format}`,
				input: str({ params, key: "content", required: true }) ?? "",
				current: transcript,
			});
		} catch (error) {
			throw new AutomationError({ message: error instanceof Error ? error.message : String(error), code: -32602 });
		}
		saveTranscript({ projectId, transcript: next });
		return describeTranscript(next);
	},

	"transcript.export": async ({ ctx: { editor }, params }) => {
		const { transcript } = requireTranscript(editor);
		const format = oneOf({ params, key: "format", values: ["srt", "vtt", "txt", "json"] as const }) ?? "srt";
		const { content, mimeType } = exportTranscript({ transcript, format });
		return { format, mimeType, content };
	},

	"transcript.translate": async ({ ctx: { editor }, params }) => {
		const { projectId, transcript } = requireTranscript(editor);
		const target = str({ params, key: "target", required: true }) ?? "";
		const { transcript: next, changed } = await aiTranslate({ transcript, target, projectId });
		saveTranscript({ projectId, transcript: next });
		return { changed, ...describeTranscript(next) };
	},

	"transcript.cleanUp": async ({ ctx: { editor }, params }) => {
		const { projectId, transcript } = requireTranscript(editor);
		const { transcript: next, changed } = await aiCleanUp({
			transcript,
			removeFillers: params.removeFillers !== false,
		});
		saveTranscript({ projectId, transcript: next });
		return { changed, ...describeTranscript(next) };
	},

	"captions.add": async ({ ctx: { editor } }) => {
		const { transcript } = requireTranscript(editor);
		const { trackId, cueCount } = await buildSubtitlesFromTranscript({ editor, transcript });
		return { trackId, captions: cueCount };
	},
};
Object.assign(HANDLERS, CAPTION_HANDLERS);

/** Asset Library over automation / MCP: search, install, apply. */
const ASSET_HANDLERS: Record<string, Handler> = {
	"assets.search": async ({ params }) => {
		const { useAssetLibrary } = await import("@/asset-library/store");
		const { libraryPacks, searchPacks, packStatus } = await import("@/asset-library/catalog");
		const { PACK_TYPES } = await import("@/asset-library/types");
		const state = useAssetLibrary.getState().state;
		const query = typeof params.query === "string" ? params.query : "";
		const type = typeof params.type === "string" && (PACK_TYPES as readonly string[]).includes(params.type) ? (params.type as (typeof PACK_TYPES)[number]) : null;
		const empty = { installed: {}, builtin: [], downloads: {}, catalog: null };
		const packs = searchPacks({ packs: libraryPacks(state ?? empty), query, type });
		return packs.map((p) => ({ id: p.id, type: p.type, title: p.title, version: p.version, plan: p.plan, status: packStatus(p, state ?? empty), assets: p.assetIds ?? [] }));
	},
	"assets.install": async ({ params }) => {
		const packId = str({ params, key: "packId", required: true }) ?? "";
		const { assetsBridge } = await import("@/asset-library/store");
		const bridge = assetsBridge();
		if (!bridge) throw new AutomationError({ message: "Installing packs needs the desktop app.", code: -32010 });
		const state = await bridge.install(packId);
		return { packId, installed: state.installed[packId]?.version ?? null };
	},
	"assets.apply": async ({ ctx: { editor }, params }) => {
		activeProject(editor);
		const assetId = str({ params, key: "assetId", required: true }) ?? "";
		const packId = typeof params.packId === "string" ? params.packId : null;
		if (packId) {
			const { useAssetLibrary } = await import("@/asset-library/store");
			const { addCatalogAsset } = await import("@/asset-library/actions");
			const pack = useAssetLibrary.getState().state?.catalog?.packs.find((p) => p.id === packId);
			const installed = useAssetLibrary.getState().state?.installed[packId];
			const version = installed?.version ?? pack?.version;
			if (!version) throw new AutomationError({ message: `Pack ${packId} isn't in the catalog`, code: -32004 });
			return addCatalogAsset({ editor, packId, version, assetId });
		}
		const { findPackAsset } = await import("@/lottie/catalog");
		const { addPackAnimation } = await import("@/lottie/actions");
		const asset = await findPackAsset(assetId);
		if (!asset) throw new AutomationError({ message: `No asset ${assetId}`, code: -32004 });
		addPackAnimation({ editor, asset });
		return { assetId: asset.id, placeholder: false };
	},
};
Object.assign(HANDLERS, ASSET_HANDLERS);

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
