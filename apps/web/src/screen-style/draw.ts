import { drawCssBackground } from "@/gradients";
import type { CursorLog } from "@/screen-zoom/types";
import { cursorAt, keyAt, ripplesAt, type Rect } from "./layout";
import type { ScreenStyle } from "./types";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function roundRect({ ctx, rect, radius }: { ctx: Ctx; rect: Rect; radius: number }) {
	ctx.beginPath();
	ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
}

/** Background fill and the card's shadow (SC-17). */
export function drawScreenBackground({
	ctx,
	width,
	height,
	card,
	style,
}: {
	ctx: Ctx;
	width: number;
	height: number;
	card: Rect;
	style: ScreenStyle["background"];
}) {
	drawCssBackground({ ctx, width, height, css: style.fill });
	if (style.shadow > 0) {
		const short = Math.min(width, height);
		ctx.save();
		ctx.shadowColor = `rgba(0,0,0,${0.25 + 0.45 * style.shadow})`;
		ctx.shadowBlur = short * 0.05 * style.shadow;
		ctx.shadowOffsetY = short * 0.012 * style.shadow;
		ctx.fillStyle = "#000";
		roundRect({ ctx, rect: card, radius: short * style.radius });
		ctx.fill();
		ctx.restore();
	}
}

/** The rounded card as a mask: white where the screen shows. */
export function drawCardMask({
	ctx,
	width,
	height,
	card,
	radius,
}: {
	ctx: Ctx;
	width: number;
	height: number;
	card: Rect;
	radius: number;
}) {
	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = "#fff";
	roundRect({ ctx, rect: card, radius: Math.min(width, height) * radius });
	ctx.fill();
}

/** A clean arrow cursor, tip at (x, y). */
function drawArrow({ ctx, x, y, size }: { ctx: Ctx; x: number; y: number; size: number }) {
	const s = size / 24;
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(s, s);
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(0, 20);
	ctx.lineTo(5.2, 15.2);
	ctx.lineTo(8.6, 23);
	ctx.lineTo(12, 21.5);
	ctx.lineTo(8.7, 13.9);
	ctx.lineTo(15.5, 13.9);
	ctx.closePath();
	ctx.shadowColor = "rgba(0,0,0,0.35)";
	ctx.shadowBlur = 3;
	ctx.shadowOffsetY = 1;
	ctx.fillStyle = "#111";
	ctx.fill();
	ctx.shadowColor = "transparent";
	ctx.lineWidth = 1.6;
	ctx.strokeStyle = "#fff";
	ctx.stroke();
	ctx.restore();
}

/**
 * Cursor, click ripples (SC-15) and shortcut badges (SC-07) for one frame.
 * `screen` is where the recording is drawn on the canvas right now (after
 * zoom), so the cursor stays on the right spot.
 */
export function drawScreenOverlay({
	ctx,
	width,
	height,
	screen,
	clip,
	log,
	seconds,
	style,
}: {
	ctx: Ctx;
	width: number;
	height: number;
	screen: Rect;
	clip: Rect | null;
	log: CursorLog;
	seconds: number;
	style: ScreenStyle;
}) {
	ctx.clearRect(0, 0, width, height);
	const map = (p: { x: number; y: number }) => ({
		x: screen.x + p.x * screen.width,
		y: screen.y + p.y * screen.height,
	});
	ctx.save();
	if (clip) {
		ctx.beginPath();
		ctx.rect(clip.x, clip.y, clip.width, clip.height);
		ctx.clip();
	}
	const base = Math.max(12, Math.min(width, height) * 0.022);
	if (style.cursor.enabled) {
		if (style.cursor.clickRipple)
			for (const ripple of ripplesAt({ log, t: seconds })) {
				const p = map(ripple);
				ctx.beginPath();
				ctx.arc(p.x, p.y, base * (0.6 + 1.6 * ripple.progress), 0, Math.PI * 2);
				ctx.globalAlpha = 1 - ripple.progress;
				ctx.lineWidth = base * 0.18;
				ctx.strokeStyle = style.cursor.rippleColor;
				ctx.stroke();
				ctx.globalAlpha = 1;
			}
		const cursor = cursorAt({
			log,
			t: seconds,
			smooth: style.cursor.smooth,
			hideAfter: style.cursor.hideAfter,
		});
		if (cursor && cursor.opacity > 0) {
			const p = map(cursor);
			ctx.globalAlpha = cursor.opacity;
			drawArrow({ ctx, x: p.x, y: p.y, size: base * style.cursor.size });
			ctx.globalAlpha = 1;
		}
	}
	ctx.restore();
	if (style.keys.enabled) {
		const key = keyAt({ log, t: seconds });
		if (key) {
			const font = Math.max(14, Math.min(width, height) * 0.035);
			ctx.save();
			ctx.globalAlpha = key.opacity;
			ctx.font = `600 ${font}px system-ui, sans-serif`;
			const w = ctx.measureText(key.label).width + font * 1.4;
			const h = font * 1.8;
			const x = (width - w) / 2;
			const y = style.keys.position === "top" ? height * 0.06 : height * 0.94 - h;
			ctx.fillStyle = "rgba(15,15,20,0.82)";
			ctx.beginPath();
			ctx.roundRect(x, y, w, h, h * 0.3);
			ctx.fill();
			ctx.fillStyle = "#fff";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(key.label, width / 2, y + h / 2);
			ctx.restore();
		}
	}
}
