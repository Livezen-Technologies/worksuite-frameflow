import { evaluateTextAnimation, parseHex } from "@/text-animation/evaluate";
import { layoutText, renderAnimatedText, frameTime, type TextContext, type TextLayout } from "@/text-animation/render";
import { graphemes, needsShaping } from "@/text-animation/segment";
import type { TextAnimation, TextAnimationStyle, UnitState } from "@/text-animation/types";
import type { LottieJson } from "../types";

/**
 * Bakes engine-animated text into a Lottie.
 *
 *  - "text-layers": one Lottie text layer (ty 5) per unit with sampled,
 *    linear keyframes for opacity, position, scale, rotation and skew, and
 *    text-document keys for changing words (typewriter, scramble, counters)
 *    and colours. Needs the font on the playing side (font refs only).
 *    Effects that Lottie text can't express (blur, masks/wipes, RGB split,
 *    highlight boxes, shine, stroke draw) are dropped in this mode.
 *  - "images": every sampled frame is drawn by the engine itself and
 *    embedded as an image layer shown for one sample. Pixel-faithful for
 *    every effect and every script (Sinhala, Tamil, mixed), at the cost of
 *    size and of resolution independence.
 *  - "auto": images when the text needs complex shaping (Sinhala/Tamil…)
 *    or the animation uses effects text layers can't carry; else text layers.
 *
 * Vector glyph outlines would need the font's glyf/CFF tables plus GSUB
 * shaping; the bundled Sinhala/Tamil fonts ship as WOFF2 (Brotli) and the
 * app has no shaper, so outlines aren't produced (see the PR notes).
 */

export type TextExportMode = "auto" | "text-layers" | "images";

const TEXT_LAYER_SAFE = new Set([
	"none",
	"fade",
	"slide",
	"rise",
	"drop",
	"pop",
	"scale-up",
	"scale-down",
	"wave",
	"bounce",
	"elastic",
	"flip-x",
	"flip-y",
	"rotate-in",
	"skew-in",
	"shake",
	"jitter",
	"swing",
	"stamp",
	"pulse",
	"float",
	"spin",
	"blink",
	"3d-tilt",
	"stretch",
	"typewriter",
	"scramble",
	"number-counter",
	"colour-cycle",
	"tracking-expand",
]);

export function textLayerSafe(animation: TextAnimation | null | undefined): boolean {
	if (!animation) return true;
	return [animation.in, animation.emphasis, animation.out].every((p) => !p || TEXT_LAYER_SAFE.has(p.effect)) && !animation.keyframes?.tracks.blur;
}

export function chooseExportMode({ text, animation, mode }: { text: string; animation: TextAnimation | null | undefined; mode: TextExportMode }): "text-layers" | "images" {
	if (mode !== "auto") return mode;
	return needsShaping(text) || !textLayerSafe(animation) ? "images" : "text-layers";
}

export interface ExportTextOptions {
	text: string;
	style: TextAnimationStyle;
	animation: TextAnimation | null | undefined;
	/** Seconds. */
	duration: number;
	fps: number;
	width: number;
	height: number;
	mode?: TextExportMode;
	/** Centre of the text block in composition pixels (default: centre). */
	x?: number;
	y?: number;
	/** For layout (measureText). Required for "text-layers". */
	ctx?: TextContext;
	/** Draws frame `time` and returns a PNG data URL. Required for "images". */
	rasterize?: (time: number) => string | Promise<string>;
	/** Image samples per second (default min(fps, 15)). */
	sampleFps?: number;
	/** Background/decor animation drawn under the text (template export). */
	background?: LottieJson | null;
	name?: string;
}

const rgb01 = (hex: string): number[] => {
	const rgb = parseHex(hex) ?? [255, 255, 255];
	return rgb.map((v) => Math.round((v / 255) * 1000) / 1000);
};

type Key = { t: number; s: number[]; i: { x: number[]; y: number[] }; o: { x: number[]; y: number[] } };

/** Linear keyframes from samples, dropping samples that repeat their neighbours. */
function animated(samples: Array<{ t: number; v: number[] }>): { a: 0; k: number[] } | { a: 1; k: Key[] } {
	const same = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-3);
	if (samples.every((s) => same(s.v, samples[0]!.v))) return { a: 0, k: samples[0]!.v };
	const keys: Key[] = [];
	samples.forEach((s, i) => {
		const prev = samples[i - 1];
		const next = samples[i + 1];
		if (prev && next && same(prev.v, s.v) && same(next.v, s.v)) return;
		const n = s.v.length;
		keys.push({ t: s.t, s: s.v.map((v) => Math.round(v * 1000) / 1000), i: { x: Array(n).fill(1), y: Array(n).fill(1) }, o: { x: Array(n).fill(0), y: Array(n).fill(0) } });
	});
	return { a: 1, k: keys };
}

function fontWeightName(w: TextAnimationStyle["fontWeight"]): string {
	const n = w === "bold" ? 700 : w === "normal" ? 400 : w;
	return n >= 800 ? "Black" : n >= 700 ? "Bold" : n >= 500 ? "Medium" : "Regular";
}

function mergeBackground(json: LottieJson, background: LottieJson | null | undefined, op: number): LottieJson {
	if (!background) return json;
	const assets = [...((json.assets as unknown[]) ?? []), { id: "__bg", nm: background.nm ?? "Background", fr: background.fr, layers: background.layers }, ...((background.assets as unknown[]) ?? [])];
	const maxInd = Math.max(0, ...(json.layers as Array<{ ind?: number }>).map((l) => l.ind ?? 0));
	const bgLayer = {
		ddd: 0,
		ind: maxInd + 1,
		ty: 0,
		nm: "Background",
		refId: "__bg",
		sr: background.fr / json.fr,
		ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [json.w / 2, json.h / 2, 0] }, a: { a: 0, k: [background.w / 2, background.h / 2, 0] }, s: { a: 0, k: [(json.w / background.w) * 100, (json.h / background.h) * 100, 100] } },
		w: background.w,
		h: background.h,
		ip: 0,
		op,
		st: 0,
		bm: 0,
	};
	return { ...json, assets, layers: [...json.layers, bgLayer], ...(background.fonts ? { fonts: mergeFonts(json.fonts, background.fonts) } : {}) };
}

function mergeFonts(a: unknown, b: unknown) {
	const list = [...(((a as { list?: unknown[] })?.list) ?? []), ...(((b as { list?: unknown[] })?.list) ?? [])];
	return { list };
}

/** Bakes the text animation (and optional background) into a Lottie document. */
export async function exportTextAnimationToLottie(options: ExportTextOptions): Promise<LottieJson> {
	const { text, style, animation, duration, fps, width, height, background, name } = options;
	const op = Math.max(1, Math.round(duration * fps));
	const cx = options.x ?? width / 2;
	const cy = options.y ?? height / 2;
	const mode = chooseExportMode({ text, animation, mode: options.mode ?? "auto" });
	const base: LottieJson = { v: "5.12.2", fr: fps, ip: 0, op, w: width, h: height, nm: name ?? "Text animation", ddd: 0, assets: [], layers: [], markers: [] };

	if (mode === "images") {
		if (!options.rasterize) throw new Error("Image export needs a rasterizer (a canvas).");
		const sampleFps = Math.max(1, Math.min(fps, options.sampleFps ?? 15));
		const step = fps / sampleFps;
		const assets: unknown[] = [];
		const layers: unknown[] = [];
		let prev = "";
		for (let i = 0, f = 0; f < op; i++, f = Math.round(i * step)) {
			const nextF = Math.min(op, Math.round((i + 1) * step));
			const src = await options.rasterize(frameTime(f, fps));
			if (src === prev && layers.length) {
				// Unchanged frame: extend the previous image instead of embedding it again.
				(layers[layers.length - 1] as { op: number }).op = nextF;
				continue;
			}
			prev = src;
			const id = `frame_${f}`;
			assets.push({ id, w: width, h: height, u: "", p: src, e: 1 });
			layers.push({
				ddd: 0,
				ind: layers.length + 1,
				ty: 2,
				nm: `Text frame ${f}`,
				refId: id,
				ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [width / 2, height / 2, 0] }, a: { a: 0, k: [width / 2, height / 2, 0] }, s: { a: 0, k: [100, 100, 100] } },
				ip: f,
				op: nextF,
				st: 0,
				bm: 0,
			});
		}
		// Lottie draws the first layer on top; frames don't overlap, order is cosmetic.
		return mergeBackground({ ...base, assets, layers, meta: { g: "Worksuite FrameFlow", textExport: "images", text } }, background, op);
	}

	if (!options.ctx) throw new Error("Text-layer export needs a canvas context for layout.");
	const layout: TextLayout = layoutText({ ctx: options.ctx, text, style, unit: animation?.unit ?? "block" });
	const fontName = `${style.fontFamily.split(",")[0]!.trim().replace(/["']/g, "").replace(/\s+/g, "")}-${fontWeightName(style.fontWeight)}`;
	const fonts = { list: [{ fName: fontName, fFamily: style.fontFamily.split(",")[0]!.trim().replace(/["']/g, ""), fStyle: fontWeightName(style.fontWeight), ascent: 75 }] };
	const fs = style.fontSize;
	const frames: UnitState[][] = [];
	for (let f = 0; f <= op; f++) {
		frames.push(animation ? evaluateTextAnimation({ animation, units: layout.units.map((u) => u.text), time: frameTime(f, fps), duration }) : layout.units.map(() => ({ opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, blur: 0, tracking: 0 })));
	}
	const layers = layout.units.map((u, i) => {
		const pos = frames.map((states, f) => {
			const s = states[i]!;
			const spread = s.tracking * fs * (u.inLine - (u.lineCount - 1) / 2);
			return { t: f, v: [cx + u.x + u.width / 2 + spread + s.x * fs, cy + u.y + s.y * fs + fs * 0.35, 0] };
		});
		const docs: Array<{ t: number; s: Record<string, unknown> }> = [];
		frames.forEach((states, f) => {
			const s = states[i]!;
			let shown = s.text ?? u.text;
			if (s.reveal !== undefined && s.reveal < 1) {
				const g = graphemes(shown);
				shown = g.slice(0, Math.round(g.length * s.reveal)).join("");
			}
			const fill = s.fill ?? style.fill;
			const last = docs[docs.length - 1];
			if (last && last.s.t === shown && JSON.stringify(last.s.fc) === JSON.stringify(rgb01(fill))) return;
			docs.push({
				t: f,
				s: {
					s: fs,
					f: fontName,
					t: shown,
					j: 2,
					tr: Math.round(style.tracking * 1000),
					lh: fs * style.lineHeight,
					ls: 0,
					fc: rgb01(fill),
					...(style.stroke ? { sc: rgb01(style.stroke.color), sw: style.stroke.width, of: false } : {}),
				},
			});
		});
		return {
			ddd: 0,
			ind: i + 1,
			ty: 5,
			nm: `Text ${i + 1}: ${u.text}`,
			sr: 1,
			ks: {
				o: animated(frames.map((st, f) => ({ t: f, v: [st[i]!.opacity * 100] }))),
				r: animated(frames.map((st, f) => ({ t: f, v: [st[i]!.rotation] }))),
				p: animated(pos),
				a: { a: 0, k: [0, -fs * 0.35, 0] },
				s: animated(frames.map((st, f) => ({ t: f, v: [st[i]!.scaleX * 100, st[i]!.scaleY * 100, 100] }))),
				sk: animated(frames.map((st, f) => ({ t: f, v: [-st[i]!.skewX] }))),
				sa: { a: 0, k: 0 },
			},
			ao: 0,
			t: { d: { k: docs }, p: {}, m: { g: 1, a: { a: 0, k: [0, 0] } }, a: [] },
			ip: 0,
			op,
			st: 0,
			bm: 0,
		};
	});
	return mergeBackground({ ...base, fonts, layers, meta: { g: "Worksuite FrameFlow", textExport: "text-layers", text } }, background, op);
}

/** Canvas rasterizer for image export (browser only). */
export function canvasRasterizer({
	text,
	style,
	animation,
	duration,
	width,
	height,
	x,
	y,
}: Pick<ExportTextOptions, "text" | "style" | "animation" | "duration" | "width" | "height" | "x" | "y">): (time: number) => string {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No 2D canvas available");
	const layout = layoutText({ ctx, text, style, unit: animation?.unit ?? "block" });
	return (time) => {
		ctx.clearRect(0, 0, width, height);
		renderAnimatedText({ ctx, text, style, animation, time, duration, x: x ?? width / 2, y: y ?? height / 2, layout });
		return canvas.toDataURL("image/png");
	};
}

/** Text content baked into an export (for round-trip checks and re-import). */
export function exportedText(json: LottieJson): string | null {
	const meta = json.meta as { text?: string } | undefined;
	if (typeof meta?.text === "string") return meta.text;
	const texts = (json.layers as Array<{ ty?: number; t?: { d?: { k?: Array<{ s?: { t?: string } }> } } }>)
		.filter((l) => l.ty === 5)
		.map((l) => {
			const k = l.t?.d?.k ?? [];
			return k[k.length - 1]?.s?.t ?? "";
		});
	return texts.length ? texts.join(" ") : null;
}
