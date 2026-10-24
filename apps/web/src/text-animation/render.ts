import { evaluateTextAnimation, parseHex } from "./evaluate";
import { breakLines, graphemes, unitSegments } from "./segment";
import type { TextAnimation, TextAnimationStyle, UnitState } from "./types";

/**
 * Canvas 2D renderer for animated text. Lays the text out once per call
 * (lines → units with measured positions), evaluates the animation at
 * `time` and draws each unit with its transform and style. The same
 * function draws the editor preview, the export frames and the library
 * thumbnails, so they always match.
 */

export type TextContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface LaidOutUnit {
	text: string;
	line: number;
	/** Index within its line (for tracking spread). */
	inLine: number;
	lineCount: number;
	/** Left edge and width in px, baseline-middle y, relative to the block centre. */
	x: number;
	width: number;
	y: number;
}

export interface TextLayout {
	units: LaidOutUnit[];
	lines: Array<{ text: string; x: number; y: number; width: number }>;
	width: number;
	height: number;
	fontSize: number;
	font: string;
}

export function fontString(style: Pick<TextAnimationStyle, "fontFamily" | "fontWeight" | "fontStyle" | "fontSize">): string {
	const family = style.fontFamily
		.split(",")
		.map((f) => f.trim().replace(/^["']|["']$/g, ""))
		.filter(Boolean)
		.map((f) => (/^(serif|sans-serif|monospace|cursive|system-ui)$/.test(f) ? f : `"${f.replace(/"/g, "")}"`))
		.join(", ");
	return `${style.fontStyle ?? "normal"} ${style.fontWeight} ${style.fontSize}px ${family}, "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif`;
}

function setSpacing(ctx: TextContext, px: number) {
	if ("letterSpacing" in ctx) (ctx as { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** Lines and unit boxes for text in a style, centred on (0, 0). */
export function layoutText({ ctx, text, style, unit }: { ctx: TextContext; text: string; style: TextAnimationStyle; unit: TextAnimation["unit"] }): TextLayout {
	const font = fontString(style);
	ctx.save();
	ctx.font = font;
	const trackPx = style.tracking * style.fontSize;
	setSpacing(ctx, trackPx);
	const measure = (s: string) => ctx.measureText(s).width;
	const lineTexts = breakLines(text, measure, style.maxWidth);
	const lh = style.fontSize * style.lineHeight;
	const height = lh * lineTexts.length;
	const widths = lineTexts.map(measure);
	const width = Math.max(0, ...widths);
	const units: LaidOutUnit[] = [];
	const lines: TextLayout["lines"] = [];
	lineTexts.forEach((line, li) => {
		const w = widths[li]!;
		const left = style.align === "left" ? -width / 2 : style.align === "right" ? width / 2 - w : -w / 2;
		const y = -height / 2 + lh * (li + 0.5);
		lines.push({ text: line, x: left, y, width: w });
		const segs = unitSegments(line, unit).filter((s) => !s.space);
		segs.forEach((seg, si) => {
			// Measure the prefix so kerning and shaping across units stay as in the full line.
			const x = left + (seg.start > 0 ? measure(line.slice(0, seg.start)) : 0);
			units.push({ text: seg.text, line: li, inLine: si, lineCount: segs.length, x, width: measure(seg.text), y });
		});
	});
	ctx.restore();
	return { units, lines, width, height, fontSize: style.fontSize, font };
}

function roundRectPath(ctx: TextContext, x: number, y: number, w: number, h: number, r: number) {
	ctx.beginPath();
	if (r > 0 && "roundRect" in ctx) (ctx as CanvasRenderingContext2D).roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
	else ctx.rect(x, y, w, h);
}

function hexAlpha(hex: string, alpha: number): string {
	const rgb = parseHex(hex);
	return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : hex;
}

function fillStyleFor({ ctx, style, state, unit, layout }: { ctx: TextContext; style: TextAnimationStyle; state: UnitState; unit: LaidOutUnit; layout: TextLayout }): string | CanvasGradient {
	if (state.gradientShift) {
		const { colors, offset } = state.gradientShift;
		const span = Math.max(1, layout.width);
		const shift = offset * span;
		const g = ctx.createLinearGradient(-span / 2 - unit.x - unit.width / 2 - shift, 0, span * 1.5 - unit.x - unit.width / 2 - shift, 0);
		colors.forEach((c, i) => g.addColorStop(i / Math.max(1, colors.length - 1), c));
		return g;
	}
	if (style.gradient && style.gradient.length >= 2 && !state.fill) {
		// One gradient across the whole block, so units line up.
		const g = ctx.createLinearGradient(-layout.width / 2 - (unit.x + unit.width / 2), 0, layout.width / 2 - (unit.x + unit.width / 2), 0);
		style.gradient.forEach((c, i) => g.addColorStop(i / (style.gradient!.length - 1), c));
		return g;
	}
	return state.fill ?? style.fill;
}

/** Draws one unit's glyphs at (−w/2, 0) in the current transform. */
function drawGlyphs({ ctx, text, style, state, unit, layout, fs }: { ctx: TextContext; text: string; style: TextAnimationStyle; state: UnitState; unit: LaidOutUnit; layout: TextLayout; fs: number }) {
	const left = -unit.width / 2;
	const glow = state.glow ?? (style.glow ? { color: style.glow.color, size: style.glow.size } : null);
	if (glow && glow.size > 0) {
		ctx.save();
		ctx.shadowColor = glow.color;
		ctx.shadowBlur = glow.size * fs;
		ctx.fillStyle = glow.color;
		ctx.fillText(text, left, 0);
		ctx.restore();
	}
	if (style.shadow) {
		ctx.shadowColor = style.shadow.color;
		ctx.shadowBlur = style.shadow.blur;
		ctx.shadowOffsetX = style.shadow.x;
		ctx.shadowOffsetY = style.shadow.y;
	}
	const strokeColor = state.stroke ?? style.stroke?.color;
	const strokeWidth = style.stroke?.width ?? (state.strokeDraw !== undefined ? Math.max(1, fs * 0.04) : 0);
	if (state.strokeDraw !== undefined && state.strokeDraw < 1) {
		// Outline draws on with a dash, the fill fades in over the last 30 %.
		const length = Math.max(1, unit.width * 6);
		ctx.save();
		ctx.lineWidth = strokeWidth || Math.max(1, fs * 0.04);
		ctx.strokeStyle = strokeColor ?? style.fill;
		ctx.setLineDash([length, length]);
		ctx.lineDashOffset = length * (1 - state.strokeDraw);
		ctx.lineJoin = "round";
		ctx.strokeText(text, left, 0);
		ctx.restore();
		const fillAlpha = Math.max(0, (state.strokeDraw - 0.7) / 0.3);
		if (fillAlpha <= 0) return;
		ctx.globalAlpha *= fillAlpha;
	}
	if (strokeColor && strokeWidth > 0) {
		ctx.save();
		ctx.lineWidth = strokeWidth;
		ctx.strokeStyle = strokeColor;
		ctx.lineJoin = "round";
		ctx.strokeText(text, left, 0);
		ctx.restore();
	}
	if (state.rgbSplit && state.rgbSplit > 0) {
		const d = state.rgbSplit * fs;
		ctx.save();
		ctx.globalAlpha *= 0.8;
		ctx.fillStyle = "#FF0040";
		ctx.fillText(text, left - d, 0);
		ctx.fillStyle = "#00E5FF";
		ctx.fillText(text, left + d, 0);
		ctx.restore();
	}
	ctx.fillStyle = fillStyleFor({ ctx, style, state, unit, layout });
	ctx.fillText(text, left, 0);
	ctx.shadowColor = "transparent";
	if (state.fillSweep && state.fillSweep.amount > 0) {
		ctx.save();
		ctx.beginPath();
		ctx.rect(left, -fs, unit.width * Math.min(1, state.fillSweep.amount), fs * 2);
		ctx.clip();
		ctx.fillStyle = state.fillSweep.color;
		ctx.fillText(text, left, 0);
		ctx.restore();
	}
	if (state.shine !== undefined && state.shine > 0 && state.shine < 1) {
		ctx.save();
		const span = layout.width + fs * 2;
		const cx = -layout.width / 2 - fs + span * state.shine - (unit.x + unit.width / 2);
		const g = ctx.createLinearGradient(cx - fs, -fs, cx + fs, fs);
		g.addColorStop(0, "rgba(255,255,255,0)");
		g.addColorStop(0.5, "rgba(255,255,255,0.85)");
		g.addColorStop(1, "rgba(255,255,255,0)");
		ctx.globalCompositeOperation = "source-atop";
		ctx.fillStyle = g;
		ctx.fillText(text, left, 0);
		ctx.restore();
	}
}

export interface RenderTextOptions {
	ctx: TextContext;
	text: string;
	style: TextAnimationStyle;
	animation: TextAnimation | null | undefined;
	/** Seconds from the clip start and the clip length. */
	time: number;
	duration: number;
	/** Block centre in the current transform. */
	x?: number;
	y?: number;
	/** Reuse a layout (e.g. across frames of an export). */
	layout?: TextLayout;
}

/** Draws animated text centred on (x, y). Returns the layout used. */
export function renderAnimatedText({ ctx, text, style, animation, time, duration, x = 0, y = 0, layout: given }: RenderTextOptions): TextLayout {
	const unit = animation?.unit ?? "block";
	const layout = given ?? layoutText({ ctx, text, style, unit });
	const states = animation ? evaluateTextAnimation({ animation, units: layout.units.map((u) => u.text), time, duration }) : layout.units.map(() => null);
	const fs = style.fontSize;
	ctx.save();
	ctx.translate(x, y);
	if (style.plate) {
		const pad = style.plate.padding * fs;
		const blockAlpha = states.length ? Math.max(...states.map((s) => s?.opacity ?? 1)) : 1;
		ctx.save();
		ctx.globalAlpha *= blockAlpha;
		ctx.fillStyle = style.plate.color;
		roundRectPath(ctx, -layout.width / 2 - pad, -layout.height / 2 - pad * 0.6, layout.width + pad * 2, layout.height + pad * 1.2, style.plate.radius * fs);
		ctx.fill();
		ctx.restore();
	}
	ctx.font = layout.font;
	ctx.textBaseline = "middle";
	ctx.textAlign = "left";
	setSpacing(ctx, style.tracking * fs);
	layout.units.forEach((u, i) => {
		const s = states[i];
		if (s && s.opacity <= 0.001) return;
		let text = s?.text ?? u.text;
		if (s?.reveal !== undefined && s.reveal < 1) {
			const g = graphemes(text);
			text = g.slice(0, Math.round(g.length * s.reveal)).join("");
		}
		const spread = s ? s.tracking * fs * (u.inLine - (u.lineCount - 1) / 2) : 0;
		const cx = u.x + u.width / 2 + spread + (s ? s.x * fs : 0);
		const cy = u.y + (s ? s.y * fs : 0);
		ctx.save();
		ctx.translate(cx, cy);
		if (s) {
			ctx.globalAlpha *= s.opacity;
			if (s.rotation) ctx.rotate((s.rotation * Math.PI) / 180);
			if (s.skewX || s.skewY) ctx.transform(1, Math.tan((s.skewY * Math.PI) / 180), Math.tan((s.skewX * Math.PI) / 180), 1, 0, 0);
			if (s.scaleX !== 1 || s.scaleY !== 1) ctx.scale(Math.max(1e-4, Math.abs(s.scaleX)) * Math.sign(s.scaleX || 1), Math.max(1e-4, Math.abs(s.scaleY)) * Math.sign(s.scaleY || 1));
			if (s.blur > 0) ctx.filter = `blur(${(s.blur * fs).toFixed(2)}px)`;
			if (s.highlight && s.highlight.amount > 0) {
				ctx.save();
				ctx.fillStyle = hexAlpha(s.highlight.color, 0.85);
				ctx.fillRect(-u.width / 2 - fs * 0.08, -fs * 0.55, (u.width + fs * 0.16) * Math.min(1, s.highlight.amount), fs * 1.1);
				ctx.restore();
			}
			if (s.box && s.box.amount > 0) {
				ctx.save();
				ctx.strokeStyle = s.box.color;
				ctx.lineWidth = Math.max(1, fs * 0.05);
				const w = u.width + fs * 0.3;
				const h = fs * 1.2;
				const perim = 2 * (w + h);
				ctx.setLineDash([perim * s.box.amount, perim]);
				ctx.strokeRect(-w / 2, -h / 2, w, h);
				ctx.restore();
			}
			if (s.clip !== undefined && s.clip < 1) {
				const w = u.width + fs * 0.4;
				const h = fs * 1.6;
				const c = Math.max(0, s.clip);
				ctx.beginPath();
				if (s.clipSide === "right") ctx.rect(w / 2 - w * c, -h / 2, w * c, h);
				else if (s.clipSide === "top") ctx.rect(-w / 2, -h / 2, w, h * c);
				else if (s.clipSide === "bottom") ctx.rect(-w / 2, h / 2 - h * c, w, h * c);
				else if (s.clipSide === "center") ctx.rect((-w / 2) * c, -h / 2, w * c, h);
				else ctx.rect(-w / 2, -h / 2, w * c, h);
				ctx.clip();
			} else if (s.clip === 1 && s.clipSide === "bottom" && s.y) {
				// Split reveal: clip to the line's resting box so the text rises out of it.
				const h = fs * 1.3;
				ctx.beginPath();
				ctx.rect(-u.width / 2 - fs, -h / 2 - s.y * fs, u.width + fs * 2, h);
				ctx.clip();
			}
		}
		drawGlyphs({ ctx, text, style, state: s ?? { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, blur: 0, tracking: 0 }, unit: u, layout, fs });
		if (s?.underline && s.underline.amount > 0) {
			ctx.filter = "none";
			ctx.fillStyle = s.underline.color;
			ctx.fillRect(-u.width / 2, fs * 0.5, u.width * Math.min(1, s.underline.amount), Math.max(1, fs * 0.07));
		}
		if (s?.caret) {
			ctx.filter = "none";
			const w = ctx.measureText(text).width;
			ctx.fillStyle = style.fill;
			ctx.fillRect(-u.width / 2 + w + fs * 0.04, -fs * 0.45, Math.max(1, fs * 0.06), fs * 0.9);
		}
		ctx.restore();
	});
	ctx.restore();
	return layout;
}

/** Maps a frame index to animation time so preview and export sample the same instants. */
export function frameTime(frame: number, fps: number): number {
	return Math.round((frame / fps) * 1e6) / 1e6;
}
