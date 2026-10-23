"use client";

import { BatchCommand, type Command } from "@/commands";
import type { EditorCore } from "@/core";
import { loadFonts } from "@/fonts/google-fonts";
import type { BrandKit } from "@/brand/store";
import type { ProjectTemplate } from "@/templates/project-templates";
import { buildTemplateCommand } from "@/templates/apply-template";
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
	kit: Pick<BrandKit, "colors" | "headingFont" | "bodyFont">;
}): PackBrand {
	const [primary, dark, light, accent] = kit.colors;
	return {
		palette: { primary, dark, light, accent: accent ?? primary },
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
			}),
		);
	}
	if (commands.length === 0) return;
	editor.command.execute({
		command: commands.length === 1 ? commands[0] : new BatchCommand(commands),
	});
	showSafeAreaGuide({ pack, aspect });
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
