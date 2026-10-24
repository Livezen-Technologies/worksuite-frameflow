import { downloadBlob } from "@/motion-studio/export";
import { styleFromResolvedText } from "@/text-animation/element-style";
import type { TextAnimation, TextAnimationStyle } from "@/text-animation/types";
import { drawTemplateFrame } from "@/text-library/template-render";
import type { TextLibraryTemplate } from "@/text-library/manifest";
import { findPackAsset } from "../catalog";
import { detectColorSlots, recolorLottie } from "../colors";
import { loadLottieJson } from "../player";
import { TEXT_SLOT_PREFIX } from "../slots";
import type { LottieElementData, LottieJson } from "../types";
import { addColorSlots, writeDotLottie } from "./dotlottie";
import { canvasRasterizer, exportTextAnimationToLottie, type TextExportMode } from "./export-text";

/** Browser glue for exporting text, templates and animation clips as Lottie JSON or dotLottie. */

export type LottieFormat = "json" | "lottie";

const safeName = (s: string) => s.replace(/[^\p{L}\p{N}\- ]+/gu, "").trim().slice(0, 60) || "animation";

/** Saves a Lottie as .json or as a dotLottie v2 with its colours as a theme. */
export function saveLottie({ json, name, format }: { json: LottieJson; name: string; format: LottieFormat }) {
	if (format === "json") {
		downloadBlob({ blob: new Blob([JSON.stringify(json)], { type: "application/json" }), name: `${safeName(name)}.json` });
		return;
	}
	const colors = detectColorSlots(json);
	const slotted = addColorSlots(json, Object.fromEntries(colors.map((c) => [c.default.toUpperCase(), c.id])));
	const bytes = writeDotLottie({ animations: [{ id: "main", name, json: slotted }], themes: colors.length ? [{ id: "default", colors: Object.fromEntries(colors.map((c) => [c.id, c.default])) }] : [] });
	downloadBlob({ blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" }), name: `${safeName(name)}.lottie` });
}

/** A text clip's words, look and animation as a Lottie of the clip's length. */
export async function exportTextClip({
	text,
	params,
	animation,
	textStyle,
	duration,
	fps,
	frame,
	fontSizePx,
	mode = "auto",
	format,
	name,
}: {
	text: string;
	params: Record<string, unknown>;
	animation: TextAnimation | undefined;
	textStyle?: { gradient?: string[] | null };
	duration: number;
	fps: number;
	frame: { width: number; height: number };
	fontSizePx: number;
	mode?: TextExportMode;
	format: LottieFormat;
	name: string;
}) {
	const style: TextAnimationStyle = styleFromResolvedText({
		params,
		scaledFontSize: fontSizePx,
		letterSpacingPx: typeof params.letterSpacing === "number" ? params.letterSpacing : 0,
		lineHeightPx: fontSizePx * (typeof params.lineHeight === "number" ? params.lineHeight : 1.2),
		textAlign: params.textAlign === "left" || params.textAlign === "right" ? params.textAlign : "center",
		textColor: typeof params.color === "string" ? params.color : "#FFFFFF",
		overrides: textStyle ? { gradient: textStyle.gradient ?? undefined } : undefined,
	});
	const x = frame.width / 2 + (typeof params["transform.positionX"] === "number" ? params["transform.positionX"] : 0);
	const y = frame.height / 2 + (typeof params["transform.positionY"] === "number" ? params["transform.positionY"] : 0);
	if (typeof document !== "undefined") await document.fonts?.ready;
	const canvas = document.createElement("canvas");
	const json = await exportTextAnimationToLottie({
		text,
		style,
		animation,
		duration,
		fps,
		width: frame.width,
		height: frame.height,
		x,
		y,
		mode,
		ctx: canvas.getContext("2d") ?? undefined,
		rasterize: canvasRasterizer({ text, style, animation, duration, width: frame.width, height: frame.height, x, y }),
		name,
	});
	saveLottie({ json, name, format });
	return json;
}

/** A library template (text slots drawn by the engine + its Lottie background). */
export async function exportTemplate({ template, lang = "en", fps = 30, frame = { width: 1920, height: 1080 }, format }: { template: TextLibraryTemplate; lang?: string; fps?: number; frame?: { width: number; height: number }; format: LottieFormat }) {
	let background: LottieJson | null = null;
	if (template.background?.packAsset) {
		const asset = await findPackAsset(template.background.packAsset).catch(() => null);
		if (asset) background = recolorLottie(await loadLottieJson({ kind: "pack", assetId: asset.id }), template.background.colors ?? {});
	}
	if (typeof document !== "undefined") await document.fonts?.ready;
	const canvas = document.createElement("canvas");
	canvas.width = frame.width;
	canvas.height = frame.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No 2D canvas available");
	const text = template.slots.map((s) => s.text[lang as "en"] ?? s.text.en).join("\n");
	// Templates always go out as engine-drawn frames, so every effect and script matches the preview.
	const json = await exportTextAnimationToLottie({
		text,
		style: { fontFamily: "Inter", fontWeight: 700, fontSize: 10, tracking: 0, lineHeight: 1.2, align: "center", fill: "#FFFFFF" },
		animation: null,
		duration: template.duration,
		fps,
		width: frame.width,
		height: frame.height,
		mode: "images",
		rasterize: (time) => {
			ctx.clearRect(0, 0, frame.width, frame.height);
			drawTemplateFrame({ ctx, template, width: frame.width, height: frame.height, time, lang });
			return canvas.toDataURL("image/png");
		},
		background,
		name: template.name.en,
	});
	saveLottie({ json, name: template.name.en, format });
	return json;
}

/**
 * An animation clip with its current overrides: colours are baked, words
 * typed into imported text layers are written into those layers, and
 * hidden layers stay hidden. (Live text on pack slots is drawn by the app
 * and isn't part of the authored Lottie; it is exported as authored.)
 */
export async function exportLottieClip({ lottie, name, format }: { lottie: LottieElementData; name: string; format: LottieFormat }) {
	const json = recolorLottie(await loadLottieJson(lottie.source), lottie.colors);
	const text = lottie.slots?.text ?? {};
	const hidden = new Set(lottie.slots?.hidden ?? []);
	json.layers = (json.layers as Array<Record<string, unknown>>).map((layer) => {
		const nm = String(layer.nm ?? "");
		if (hidden.has(nm)) return { ...layer, hd: true };
		const override = nm.startsWith(TEXT_SLOT_PREFIX) ? text[nm.slice(TEXT_SLOT_PREFIX.length)] : undefined;
		if (layer.ty === 5 && override?.text !== undefined) {
			const t = layer.t as { d: { k: Array<{ s: Record<string, unknown> }> } };
			return { ...layer, t: { ...t, d: { ...t.d, k: t.d.k.map((k) => ({ ...k, s: { ...k.s, t: override.text } })) } } };
		}
		return layer;
	});
	saveLottie({ json, name, format });
	return json;
}
