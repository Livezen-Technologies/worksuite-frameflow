import type { TCanvasSize } from "@/project/types";
import type { ElementClipboardItem } from "./types";

/**
 * Pasting into a project of another size (SRS MP-20): offsets scale with
 * the frame so clips land in the same place relative to it. Media is drawn
 * contained in the frame and text sizes follow the frame height already,
 * so only positions change.
 */
export function fitItemsToCanvas({
	items,
	from,
	to,
}: {
	items: ElementClipboardItem[];
	from: TCanvasSize;
	to: TCanvasSize;
}): ElementClipboardItem[] {
	if (from.width === to.width && from.height === to.height) return items;
	const sx = to.width / from.width;
	const sy = to.height / from.height;
	return items.map((item) => {
		const params = item.element.params ?? {};
		const x = params["transform.positionX"];
		const y = params["transform.positionY"];
		if (typeof x !== "number" && typeof y !== "number") return item;
		return {
			...item,
			element: {
				...item.element,
				params: {
					...params,
					...(typeof x === "number" ? { "transform.positionX": x * sx } : {}),
					...(typeof y === "number" ? { "transform.positionY": y * sy } : {}),
				},
			},
		};
	});
}

/** What a copy puts on the system clipboard as text (MP-19). */
export function clipboardText({
	items,
}: {
	items: ElementClipboardItem[];
}): string {
	const texts = items.flatMap((item) => {
		const content =
			item.element.type === "text" ? item.element.params?.content : undefined;
		return typeof content === "string" && content.trim() ? [content] : [];
	});
	if (texts.length) return texts.join("\n");
	return `FrameFlow: ${items.length} clip${items.length === 1 ? "" : "s"}`;
}

/** SRT or WebVTT text (MP-18). */
export function looksLikeSubtitles(text: string): boolean {
	return (
		/^WEBVTT/m.test(text) ||
		/\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}/.test(
			text,
		)
	);
}
