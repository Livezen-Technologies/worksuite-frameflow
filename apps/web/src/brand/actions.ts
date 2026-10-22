"use client";

import { AddMediaAssetCommand } from "@/commands/media";
import { AddTrackCommand, InsertElementCommand } from "@/commands/timeline";
import { BatchCommand } from "@/commands";
import type { EditorCore } from "@/core";
import { loadFonts } from "@/fonts/google-fonts";
import { processMediaAssets } from "@/media/processing";
import type { ParamValues } from "@/params";
import {
	buildElementFromMedia,
	buildTextElement,
} from "@/timeline/element-utils";
import type { TimelineElement } from "@/timeline";
import { mediaTimeFromSeconds, roundMediaTime } from "@/wasm";
import type { BrandKit, BrandLogo } from "./store";
import { watermarkTransform } from "./watermark";

async function dataUrlToFile({ logo }: { logo: BrandLogo }): Promise<File> {
	const blob = await (await fetch(logo.dataUrl)).blob();
	return new File([blob], logo.name, { type: blob.type || "image/png" });
}

/** Adds the logo on a new top track for the whole video (one undo step). */
export async function addLogoWatermark({
	editor,
	logo,
	kit,
}: {
	editor: EditorCore;
	logo: BrandLogo;
	kit: BrandKit;
}): Promise<void> {
	const project = editor.project.getActive();
	const [asset] = await processMediaAssets({
		files: [await dataUrlToFile({ logo })],
	});
	if (!asset) throw new Error("Couldn't read the logo");

	const addMedia = new AddMediaAssetCommand({
		projectId: project.metadata.id,
		asset,
	});
	const addTrack = new AddTrackCommand({ type: "video", index: 0 });
	const total = editor.timeline.getTotalDuration();
	const duration = roundMediaTime({
		time: Math.max(total, mediaTimeFromSeconds({ seconds: 5 })),
	});
	const element = buildElementFromMedia({
		mediaId: addMedia.getAssetId(),
		mediaType: "image",
		name: `${logo.name} (watermark)`,
		duration,
		startTime: roundMediaTime({ time: 0 }),
	});
	const { corner, size, opacity } = kit.watermark;
	const placed = {
		...element,
		params: {
			...element.params,
			opacity: opacity / 100,
			...watermarkTransform({
				frame: project.settings.canvasSize,
				image: { width: asset.width ?? 512, height: asset.height ?? 512 },
				corner,
				size,
			}),
		},
	};
	editor.command.execute({
		command: new BatchCommand([
			addMedia,
			addTrack,
			new InsertElementCommand({
				element: placed,
				placement: { mode: "explicit", trackId: addTrack.getTrackId() },
			}),
		]),
	});
}

export type BrandTextKind = "heading" | "body" | "lower-third";

/** Text in the brand's fonts and colours, added at the playhead. */
export async function addBrandText({
	editor,
	kit,
	kind,
}: {
	editor: EditorCore;
	kit: BrandKit;
	kind: BrandTextKind;
}): Promise<void> {
	const primary = kit.colors[0] ?? "#4C8DFF";
	const light = kit.colors.find((c) => /^#f{3,6}$/i.test(c)) ?? "#FFFFFF";
	await loadFonts({ families: [kit.headingFont, kit.bodyFont] }).catch(
		() => {},
	);
	const frame = editor.project.getActive().settings.canvasSize;
	const params: ParamValues =
		kind === "heading"
			? {
					content: "Your headline",
					fontFamily: kit.headingFont,
					fontWeight: "bold",
					fontSize: 20,
					color: light,
					"animation.in": "slide-up",
				}
			: kind === "body"
				? {
						content: "Supporting text goes here",
						fontFamily: kit.bodyFont,
						fontSize: 8,
						color: light,
						"animation.in": "fade",
					}
				: {
						content: `${kit.name}\nTitle or role`,
						fontFamily: kit.headingFont,
						fontWeight: "bold",
						fontSize: 7,
						color: light,
						textAlign: "left",
						"background.enabled": true,
						"background.color": primary,
						"background.cornerRadius": 10,
						"background.paddingX": 24,
						"background.paddingY": 12,
						"stroke.enabled": false,
						"transform.positionX": Math.round(-frame.width * 0.28),
						"transform.positionY": Math.round(frame.height * 0.33),
						"animation.in": "slide-right",
						"animation.out": "fade",
					};
	if (kind !== "lower-third") params["shadow.enabled"] = true;
	editor.timeline.insertElement({
		element: buildTextElement({
			raw: { name: String(params.content).split("\n")[0], params },
			startTime: editor.playback.getCurrentTime(),
		}),
		placement: { mode: "auto" },
	});
}

/** Brand fonts and a colour on text; a colour as the fill of shapes. */
export function brandPatch({
	element,
	kit,
	color,
}: {
	element: TimelineElement;
	kit: BrandKit;
	color?: string;
}): ParamValues | null {
	if (element.type === "text") {
		const size = Number(element.params.fontSize ?? 15);
		return {
			fontFamily: size >= 12 ? kit.headingFont : kit.bodyFont,
			...(color ? { color } : {}),
		};
	}
	if (element.type === "graphic" && color) return { fill: color };
	return null;
}

export async function applyBrandToSelection({
	editor,
	targets,
	kit,
	color,
}: {
	editor: EditorCore;
	targets: { trackId: string; element: TimelineElement }[];
	kit: BrandKit;
	color?: string;
}): Promise<number> {
	await loadFonts({ families: [kit.headingFont, kit.bodyFont] }).catch(
		() => {},
	);
	const updates = targets.flatMap(({ trackId, element }) => {
		const patch = brandPatch({ element, kit, color });
		return patch
			? [
					{
						trackId,
						elementId: element.id,
						patch: { params: { ...element.params, ...patch } },
					},
				]
			: [];
	});
	editor.timeline.updateElements({ updates });
	return updates.length;
}
