import type { CursorLog } from "@/screen-zoom/types";

/** Part of the screen to record, as fractions 0–1 of its width and height (SC-01). */
export interface CaptureArea {
	x: number;
	y: number;
	width: number;
	height: number;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** A dragged box from two corners, kept inside the screen and at least 5% each way. */
export function areaFromCorners({
	a,
	b,
}: {
	a: [number, number];
	b: [number, number];
}): CaptureArea | null {
	const x = clamp(Math.min(a[0], b[0]));
	const y = clamp(Math.min(a[1], b[1]));
	const width = clamp(Math.max(a[0], b[0])) - x;
	const height = clamp(Math.max(a[1], b[1])) - y;
	if (width < 0.05 || height < 0.05) return null;
	return { x, y, width, height };
}

/** Pixel rectangle of the area in a frame, with even sizes for the encoder. */
export function areaPixels({
	area,
	width,
	height,
}: {
	area: CaptureArea;
	width: number;
	height: number;
}): { sx: number; sy: number; sw: number; sh: number } {
	const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
	const sw = even(area.width * width);
	const sh = even(area.height * height);
	return {
		sx: Math.min(width - sw, Math.round(area.x * width)),
		sy: Math.min(height - sh, Math.round(area.y * height)),
		sw,
		sh,
	};
}

/** The cursor log in the recorded area's own 0–1 coordinates, so zooms and the clean cursor line up. */
export function cropLog({ log, area }: { log: CursorLog; area: CaptureArea }): CursorLog {
	const px = (x: number) => (x - area.x) / area.width;
	const py = (y: number) => (y - area.y) / area.height;
	return {
		...log,
		display: {
			width: Math.round(log.display.width * area.width),
			height: Math.round(log.display.height * area.height),
		},
		samples: log.samples.map(([t, x, y]) => [t, px(x), py(y)]),
		clicks: log.clicks.map(([t, x, y, b]) => [t, px(x), py(y), b]),
		typing: log.typing.map(([t, x, y]) => [t, px(x), py(y)]),
	};
}
