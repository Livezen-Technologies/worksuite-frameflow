import type { EditorCore } from "@/core";
import { findPackAsset } from "@/lottie/catalog";
import { addPackAnimation, insertAnimation } from "@/lottie/actions";
import { lottieDataFromJson, lottieInsertScale } from "@/lottie/element";
import { backdropLottie, backdropSpec } from "./backdrop";
import type { TextStyleOverrides } from "@/text-animation/element-style";
import type { TextAnimation, TextAnimationStyle } from "@/text-animation/types";
import { FONT_SIZE_SCALE_REFERENCE, MIN_FONT_SIZE } from "@/text/typography";
import { buildTextElement } from "@/timeline/element-utils";
import type { TextDragData } from "@/timeline/drag";
import { mediaTimeFromSeconds, type MediaTime } from "@/wasm";
import { localName, type TemplateSlot, type TextLibraryAnimation, type TextLibraryTemplate } from "./manifest";

/** Text clip params for a library style (font, colours, stroke, shadow, glow, plate). */
export function paramsFromStyle(style: Partial<TextAnimationStyle> | undefined, fontSize?: number): Record<string, unknown> {
	const p: Record<string, unknown> = {};
	if (!style) return fontSize ? { fontSize } : p;
	if (style.fontFamily) p.fontFamily = style.fontFamily;
	if (style.fontWeight !== undefined) p.fontWeight = style.fontWeight === "bold" || (typeof style.fontWeight === "number" && style.fontWeight >= 600) ? "bold" : "normal";
	if (style.fontStyle) p.fontStyle = style.fontStyle;
	if (style.fill) p.color = style.fill;
	if (style.align) p.textAlign = style.align;
	if (style.lineHeight) p.lineHeight = style.lineHeight;
	if (style.stroke) Object.assign(p, { "stroke.enabled": true, "stroke.color": style.stroke.color, "stroke.width": Math.min(40, style.stroke.width) });
	if (style.shadow) Object.assign(p, { "shadow.enabled": true, "shadow.color": style.shadow.color, "shadow.blur": style.shadow.blur, "shadow.offsetX": style.shadow.x, "shadow.offsetY": style.shadow.y });
	if (style.glow) Object.assign(p, { "glow.enabled": true, "glow.color": style.glow.color, "glow.size": Math.round(style.glow.size * 100) });
	if (style.plate) Object.assign(p, { "background.enabled": true, "background.color": style.plate.color });
	if (fontSize) p.fontSize = fontSize;
	return p;
}

function overridesFromStyle(style: Partial<TextAnimationStyle> | undefined): TextStyleOverrides | undefined {
	if (!style?.gradient) return undefined;
	return { gradient: style.gradient };
}

/**
 * Shrinks a new text clip until its widest line fits 90% of the frame, so
 * a title made for 16:9 still lands inside a 4:3 or 9:16 canvas. Text that
 * already fits is left at its designed size.
 */
export function fitTextToFrame<T extends { params: Record<string, unknown> }>(element: T, frame: { width: number; height: number }): T {
	const p = element.params;
	const fontSize = typeof p.fontSize === "number" ? p.fontSize : null;
	const content = typeof p.content === "string" ? p.content : "";
	if (!fontSize || !content || typeof OffscreenCanvas === "undefined") return element;
	const ctx = new OffscreenCanvas(8, 8).getContext("2d");
	if (!ctx) return element;
	const px = fontSize * (frame.height / FONT_SIZE_SCALE_REFERENCE);
	const family = typeof p.fontFamily === "string" ? p.fontFamily : "Inter";
	ctx.font = `${p.fontWeight === "bold" ? "bold " : ""}${px}px "${family}", "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif`;
	const stroke = typeof p["stroke.width"] === "number" && p["stroke.enabled"] ? p["stroke.width"] : 0;
	const widest = Math.max(...content.split("\n").map((line) => ctx.measureText(line).width)) + stroke * 2;
	const room = frame.width * 0.9;
	if (widest <= room) return element;
	const fitted = Math.max(MIN_FONT_SIZE, Math.floor(fontSize * (room / widest) * 10) / 10);
	return { ...element, params: { ...p, fontSize: fitted } };
}

/** A new text clip for a library animation. */
export function textClipForAnimation({ item, text, lang = "en", startTime, frame }: { item: TextLibraryAnimation; text?: string; lang?: string; startTime: MediaTime; frame?: { width: number; height: number } }) {
	const content = text?.trim() || (item.previewText ? localName(item.previewText, lang) : localName(item.name, lang));
	const element = buildTextElement({
		raw: { name: localName(item.name, lang), params: { ...paramsFromStyle(item.style), content }, ...(item.duration ? { duration: mediaTimeFromSeconds({ seconds: item.duration }) } : {}) },
		startTime,
	});
	const fitted = frame ? fitTextToFrame(element, frame) : element;
	return { ...fitted, textAnimation: structuredClone(item.animation), ...(overridesFromStyle(item.style) ? { textStyle: overridesFromStyle(item.style) } : {}) };
}

/** Text clips for a template's slots, positioned in a frame. */
export function textClipsForTemplate({
	template,
	lang = "en",
	startTime,
	frame,
}: {
	template: TextLibraryTemplate;
	lang?: string;
	startTime: MediaTime;
	frame: { width: number; height: number };
}) {
	const start = Number(startTime);
	return template.slots.map((slot: TemplateSlot) => {
		const from = slot.start ?? 0;
		const to = template.duration - (slot.end ?? 0);
		const element = buildTextElement({
			raw: {
				name: `${localName(template.name, lang)} — ${slot.name}`,
				duration: mediaTimeFromSeconds({ seconds: Math.max(0.1, to - from) }),
				params: {
					...paramsFromStyle(slot.style, Math.round(slot.size * FONT_SIZE_SCALE_REFERENCE * 10) / 10),
					content: localName(slot.text, lang),
					"transform.positionX": Math.round((slot.x - 0.5) * frame.width),
					"transform.positionY": Math.round((slot.y - 0.5) * frame.height),
				},
			},
			startTime: (start + Number(mediaTimeFromSeconds({ seconds: from }))) as MediaTime,
		});
		const overrides = overridesFromStyle(slot.style);
		return { ...fitTextToFrame(element, frame), ...(slot.animation ? { textAnimation: structuredClone(slot.animation) } : {}), ...(overrides ? { textStyle: overrides } : {}) };
	});
}

export function addAnimationAtPlayhead({ editor, item, text, lang }: { editor: EditorCore; item: TextLibraryAnimation; text?: string; lang?: string }) {
	if (!editor.scenes.getActiveSceneOrNull()) return;
	const frame = editor.project.getActive().settings.canvasSize;
	editor.timeline.insertElement({ element: textClipForAnimation({ item, text, lang, startTime: editor.playback.getCurrentTime(), frame }), placement: { mode: "auto" } });
}

export async function addTemplateAtPlayhead({ editor, template, lang }: { editor: EditorCore; template: TextLibraryTemplate; lang?: string }) {
	if (!editor.scenes.getActiveSceneOrNull()) return;
	const startTime = editor.playback.getCurrentTime();
	const frame = editor.project.getActive().settings.canvasSize;
	// Animated background (rays, confetti…): a frame-sized animation clip under the text.
	if (template.bg) {
		const spec = backdropSpec({ bg: template.bg, width: frame.width, height: frame.height, duration: template.duration });
		const json = backdropLottie({ bg: template.bg, width: frame.width, height: frame.height, duration: template.duration });
		insertAnimation({
			editor,
			name: `${localName(template.name, lang ?? "en")} — background`,
			lottie: lottieDataFromJson({ source: { kind: "backdrop", spec }, json }),
			params: lottieInsertScale({ width: frame.width, height: frame.height, frame, scale: 1 }),
			startTime,
		});
	} else if (template.background?.packAsset) {
		const asset = await findPackAsset(template.background.packAsset).catch(() => null);
		if (asset) addPackAnimation({ editor, asset, startTime, withSound: false });
	}
	for (const element of textClipsForTemplate({ template, lang, startTime, frame })) editor.timeline.insertElement({ element, placement: { mode: "auto" } });
}

/** Applies a library animation to text clips in one undo step. */
export function applyAnimationToClips({ editor, animation, targets }: { editor: EditorCore; animation: TextAnimation; targets: Array<{ trackId: string; elementId: string }> }) {
	if (targets.length === 0) return;
	editor.timeline.updateElements({ updates: targets.map((t) => ({ ...t, patch: { textAnimation: structuredClone(animation) } })) });
}

/** Drag payload: dropping on empty timeline adds a clip, on a text clip applies the animation. */
export function animationDragData({ item, text, lang = "en" }: { item: TextLibraryAnimation; text?: string; lang?: string }): TextDragData {
	return {
		type: "text",
		id: item.id,
		name: localName(item.name, lang),
		content: text?.trim() || (item.previewText ? localName(item.previewText, lang) : localName(item.name, lang)),
		params: paramsFromStyle(item.style) as TextDragData["params"],
		textAnimation: item.animation,
		targetElementTypes: ["text"],
	};
}
