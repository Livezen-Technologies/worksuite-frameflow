"use client";

import { BatchCommand, type Command } from "@/commands";
import type { EditorCore } from "@/core";
import { loadFonts } from "@/fonts/google-fonts";
import type { BrandKit } from "@/brand/store";
import type { ProjectTemplate } from "@/templates/project-templates";
import { buildTemplateCommand, type TemplateAudio, type TemplateLogo } from "@/templates/apply-template";
import { createTimelineAudioBuffer, extractRmsRange } from "@/media/audio";
import { AddMediaAssetCommand } from "@/commands/media";
import { processMediaAssets } from "@/media/processing";
import { usePreviewStore } from "@/preview/preview-store";
import { isGuideId } from "@/guides";
import {
	mediaTimeFromSeconds,
	roundMediaTime,
	TICKS_PER_SECOND,
	type MediaTime,
} from "@/wasm";
import {
	compilePackTemplate,
	type PackBrand,
	type PackFields,
} from "./compile";
import type { AspectId, Pack, PackLanguage, PackTemplate } from "./types";

/** Brand kit colours and fonts in pack roles (SP-05). */
export function brandForPacks({
	kit,
}: {
	kit: Pick<BrandKit, "colors" | "headingFont" | "bodyFont"> & Partial<Pick<BrandKit, "logos">>;
}): PackBrand {
	const [primary, dark, light, accent] = kit.colors;
	const [logo] = kit.logos ?? [];
	return {
		palette: { primary, dark, light, accent: accent ?? primary },
		...(logo ? { logo: { name: logo.name, dataUrl: logo.dataUrl } } : {}),
		headingFont: kit.headingFont,
		bodyFont: kit.bodyFont,
	};
}

/** Platform overlay to show while placing on a vertical frame (SP-04). */
const GUIDES: Partial<Record<string, string>> = {
	"tiktok:9:16": "tiktok",
	"youtube:9:16": "yt-shorts",
	"facebook:9:16": "ig-reels",
};

export function showSafeAreaGuide({
	pack,
	aspect,
}: {
	pack: Pack;
	aspect: AspectId;
}) {
	const guide = GUIDES[`${pack.id}:${aspect}`];
	if (guide && isGuideId(guide))
		usePreviewStore.setState({ activeGuide: guide });
}

function fontsOf(template: ProjectTemplate): string[] {
	return [
		...new Set(
			template.layers.flatMap((l) =>
				l.kind === "text" && typeof l.style.fontFamily === "string"
					? [l.style.fontFamily]
					: [],
			),
		),
	];
}

interface Placement {
	template: PackTemplate;
	at: MediaTime;
	fields?: PackFields;
}

/** Adds one or more pack templates as a single undo step. */
export async function applyPackTemplates({
	editor,
	pack,
	aspect,
	language,
	fields,
	brand,
	placements,
}: {
	editor: EditorCore;
	pack: Pack;
	aspect: AspectId;
	language: PackLanguage;
	fields: PackFields;
	brand?: PackBrand;
	placements: Placement[];
}) {
	const media = editor.media.getAssets();
	const commands: Command[] = [];
	// Load the fonts before the clips appear.
	const families = new Set<string>();
	for (const placement of placements)
		for (const f of fontsOf(
			compilePackTemplate({
				pack,
				template: placement.template,
				aspect,
				language,
				brand,
			}),
		))
			families.add(f);
	await loadFonts({ families: [...families] }).catch(() => {});
	// The brand logo goes into the project once, for every logo layer (SP-05).
	let logo: TemplateLogo | undefined;
	const wantsLogo = placements.some((p) => p.template.layers.some((l) => l.kind === "logo"));
	if (brand?.logo && wantsLogo) {
		const blob = await (await fetch(brand.logo.dataUrl)).blob();
		const [asset] = await processMediaAssets({
			files: [new File([blob], brand.logo.name, { type: blob.type || "image/png" })],
		});
		if (asset) {
			const add = new AddMediaAssetCommand({ projectId: editor.project.getActive().metadata.id, asset });
			commands.push(add);
			logo = {
				mediaId: add.getAssetId(),
				width: asset.width ?? 512,
				height: asset.height ?? 512,
				name: brand.logo.name,
			};
		}
	}
	// Audiogram bars follow the timeline's sound (SP-13).
	let audio: TemplateAudio | undefined;
	if (placements.some((p) => p.template.layers.some((l) => l.kind === "shape" && l.audioBar !== undefined)))
		audio = await timelineLevels({ editor });
	for (const placement of placements) {
		const compiled = compilePackTemplate({
			pack,
			template: placement.template,
			aspect,
			language,
			fields: { ...fields, ...placement.fields },
			brand,
		});
		commands.push(
			buildTemplateCommand({
				editor,
				template: compiled,
				media,
				at: placement.at,
				logo,
				audio,
			}),
		);
	}
	if (commands.length === 0) return;
	editor.command.execute({
		command: commands.length === 1 ? commands[0] : new BatchCommand(commands),
	});
	showSafeAreaGuide({ pack, aspect });
}

const LEVEL_RATE = 15;

/** The mixed timeline sound as 0–1 levels, 15 a second, or nothing when silent. */
async function timelineLevels({ editor }: { editor: EditorCore }): Promise<TemplateAudio | undefined> {
	const duration = editor.timeline.getTotalDuration();
	if (duration <= 0) return undefined;
	try {
		const buffer = await createTimelineAudioBuffer({
			tracks: editor.scenes.getActiveScene().tracks,
			mediaAssets: editor.media.getAssets(),
			duration,
		});
		if (!buffer) return undefined;
		const count = Math.max(1, Math.ceil(buffer.duration * LEVEL_RATE));
		const rms = extractRmsRange({ buffer, count, startSample: 0, endSample: buffer.length });
		// Scale to the loud parts (95th percentile), so one peak doesn't flatten the rest.
		const sorted = [...rms].sort((a, b) => a - b);
		const top = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1] || 0;
		if (top <= 0) return undefined;
		return { levels: rms.map((v) => Math.min(1, v / top)), rate: LEVEL_RATE };
	} catch {
		return undefined;
	}
}

const seconds = (s: number) =>
	roundMediaTime({ time: mediaTimeFromSeconds({ seconds: s }) });

/** Chapter title at each bookmark, numbered, titled from its note (SP-06). */
export function chapterPlacements({
	editor,
	template,
}: {
	editor: EditorCore;
	template: PackTemplate;
}): Placement[] {
	const bookmarks = editor.scenes.getActiveScene().bookmarks ?? [];
	return [...bookmarks]
		.sort((a, b) => a.time - b.time)
		.map((bookmark, index) => ({
			template,
			at: bookmark.time,
			fields: {
				chapter: String(index + 1),
				...(bookmark.note?.trim()
					? { chapterTitle: bookmark.note.trim() }
					: {}),
			},
		}));
}

/** "Use the whole pack": intro, name, prompts and ending at sensible times (SP-12). */
export function packSetPlacements({
	editor,
	pack,
	aspect,
}: {
	editor: EditorCore;
	pack: Pack;
	aspect: AspectId;
}): Placement[] {
	const total = editor.timeline.getTotalDuration() / TICKS_PER_SECOND;
	const length = Math.max(total, 20);
	const find = (purpose: PackTemplate["purpose"]) =>
		pack.templates.find(
			(t) =>
				t.purpose === purpose && (t.aspects ?? pack.aspects).includes(aspect),
		);
	const plan: [PackTemplate | undefined, number][] = [
		[find("intro"), 0],
		[find("lower-third"), 5],
		[find("call-to-action"), length * 0.5],
		[find("end-screen"), Math.max(length - 6, 8)],
	];
	return plan.flatMap(([template, at]) =>
		template ? [{ template, at: seconds(at) }] : [],
	);
}
