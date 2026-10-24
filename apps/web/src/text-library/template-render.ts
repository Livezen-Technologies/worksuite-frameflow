import { renderAnimatedText, type TextContext } from "@/text-animation/render";
import type { TextAnimationStyle } from "@/text-animation/types";
import { localName, type TextLibraryTemplate } from "./manifest";

const BASE: TextAnimationStyle = {
	fontFamily: "Inter, Noto Sans Sinhala, Noto Sans Tamil",
	fontWeight: 700,
	fontSize: 20,
	tracking: 0,
	lineHeight: 1.15,
	align: "center",
	fill: "#FFFFFF",
};

/** The largest box of a template's aspect ("9:16", "1:1"…) centred in a w×h tile. */
export function aspectBox(aspect: string | undefined, width: number, height: number): { x: number; y: number; width: number; height: number } {
	const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspect ?? "");
	const ratio = m ? Number(m[1]) / Number(m[2]) : width / height;
	if (!(ratio > 0) || Math.abs(ratio - width / height) < 0.01) return { x: 0, y: 0, width, height };
	const w = Math.min(width, height * ratio);
	const h = w / ratio;
	return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

/** Draws a template's text slots at time `t` into a w×h box (thumbnails, previews). */
export function drawTemplateFrame({
	ctx,
	template,
	width,
	height,
	time,
	lang = "en",
	override,
}: {
	ctx: TextContext;
	template: Pick<TextLibraryTemplate, "slots" | "duration">;
	width: number;
	height: number;
	time: number;
	lang?: string;
	/** Text for the first slot ("Preview with: …"). */
	override?: string;
}) {
	template.slots.forEach((slot, i) => {
		const from = slot.start ?? 0;
		const to = template.duration - (slot.end ?? 0);
		if (time < from || time > to) return;
		const scale = height / 1080;
		const style: TextAnimationStyle = {
			...BASE,
			...slot.style,
			fontSize: slot.size * height,
			maxWidth: width * 0.92,
			...(slot.style?.shadow ? { shadow: { ...slot.style.shadow, blur: slot.style.shadow.blur * scale, x: slot.style.shadow.x * scale, y: slot.style.shadow.y * scale } } : {}),
			...(slot.style?.stroke ? { stroke: { ...slot.style.stroke, width: Math.max(0.5, slot.style.stroke.width * scale) } } : {}),
		};
		renderAnimatedText({
			ctx,
			text: i === 0 && override?.trim() ? override : localName(slot.text, lang),
			style,
			animation: slot.animation,
			time: time - from,
			duration: to - from,
			x: slot.x * width,
			y: slot.y * height,
		});
	});
}
