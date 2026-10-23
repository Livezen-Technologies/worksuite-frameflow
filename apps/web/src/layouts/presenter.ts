import type { TCanvasSize } from "@/project/types";

/** Vertical presenter layouts (SRS ED-19). */
export type PresenterLayout =
	| "screen-above"
	| "presenter-above"
	| "focus-inset"
	| "screen-on-background";

export const PRESENTER_LAYOUTS: { id: PresenterLayout; label: string }[] = [
	{ id: "screen-above", label: "Screen above presenter" },
	{ id: "presenter-above", label: "Presenter above screen" },
	{ id: "focus-inset", label: "Focused screen + camera inset" },
	{ id: "screen-on-background", label: "Full-width screen on a background" },
];

export interface Placement {
	positionX: number;
	positionY: number;
	scale: number;
	/** Hidden behind the other clip (only one shows). */
	hidden?: boolean;
}

/** Size a clip of aspect `aspect` takes at scale 1: contained in the frame. */
function contained({ aspect, frame }: { aspect: number; frame: TCanvasSize }) {
	return aspect > frame.width / frame.height
		? { width: frame.width, height: frame.width / aspect }
		: { width: frame.height * aspect, height: frame.height };
}

/** Covers a box (cx, cy offsets from the frame centre). */
function cover({
	aspect,
	frame,
	box,
}: {
	aspect: number;
	frame: TCanvasSize;
	box: { cx: number; cy: number; width: number; height: number };
}): Placement {
	const base = contained({ aspect, frame });
	return {
		positionX: box.cx,
		positionY: box.cy,
		scale: Math.max(box.width / base.width, box.height / base.height),
	};
}

/** Fits inside a box. */
function fit({
	aspect,
	frame,
	box,
}: {
	aspect: number;
	frame: TCanvasSize;
	box: { cx: number; cy: number; width: number; height: number };
}): Placement {
	const base = contained({ aspect, frame });
	return {
		positionX: box.cx,
		positionY: box.cy,
		scale: Math.min(box.width / base.width, box.height / base.height),
	};
}

/**
 * Where the screen recording and the presenter camera go. Halves are
 * covered (overflow falls outside the frame sideways), the inset is fitted.
 */
export function presenterPlacements({
	layout,
	frame,
	screenAspect,
	cameraAspect,
}: {
	layout: PresenterLayout;
	frame: TCanvasSize;
	screenAspect: number;
	cameraAspect: number;
}): { screen: Placement; camera: Placement } {
	const { width: W, height: H } = frame;
	const top = { cx: 0, cy: -H / 4, width: W, height: H / 2 };
	const bottom = { cx: 0, cy: H / 4, width: W, height: H / 2 };
	const margin = Math.round(Math.min(W, H) * 0.04);
	const insetW = W * 0.34;
	const inset = {
		cx: W / 2 - margin - insetW / 2,
		cy: H / 2 - margin - insetW / 2,
		width: insetW,
		height: insetW,
	};
	switch (layout) {
		case "screen-above":
			return {
				screen: cover({ aspect: screenAspect, frame, box: top }),
				camera: cover({ aspect: cameraAspect, frame, box: bottom }),
			};
		case "presenter-above":
			return {
				screen: cover({ aspect: screenAspect, frame, box: bottom }),
				camera: cover({ aspect: cameraAspect, frame, box: top }),
			};
		case "focus-inset":
			return {
				screen: cover({
					aspect: screenAspect,
					frame,
					box: { cx: 0, cy: 0, width: W, height: H },
				}),
				camera: fit({ aspect: cameraAspect, frame, box: inset }),
			};
		case "screen-on-background":
			return {
				screen: fit({
					aspect: screenAspect,
					frame,
					box: { cx: 0, cy: 0, width: W, height: H },
				}),
				camera: { positionX: 0, positionY: 0, scale: 1, hidden: true },
			};
	}
}
