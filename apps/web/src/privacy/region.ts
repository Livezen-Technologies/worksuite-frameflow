/**
 * A privacy region (SRS ED-15): an effect clip limited to one area of the
 * frame, e.g. blur or pixelate over a password or a face. Fractions of the
 * frame, so the region stays put when the project changes size.
 */
export interface PrivacyRegion {
	/** Left edge, 0–1 of the frame width. */
	x: number;
	/** Top edge, 0–1 of the frame height. */
	y: number;
	width: number;
	height: number;
	shape: "rect" | "ellipse";
	/** Soft edge, 0–1 of the region's shorter side. */
	feather: number;
}

export const DEFAULT_REGION: PrivacyRegion = {
	x: 0.35,
	y: 0.35,
	width: 0.3,
	height: 0.3,
	shape: "rect",
	feather: 0,
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Keeps the region inside the frame and at least 1% in size. */
export function clampRegion(region: PrivacyRegion): PrivacyRegion {
	const width = Math.min(1, Math.max(0.01, region.width));
	const height = Math.min(1, Math.max(0.01, region.height));
	return {
		...region,
		width,
		height,
		x: Math.min(clamp01(region.x), 1 - width),
		y: Math.min(clamp01(region.y), 1 - height),
		feather: clamp01(region.feather),
	};
}

/** The region in pixels of a frame, plus its feather in pixels. */
export function regionPixels({
	region,
	width,
	height,
}: {
	region: PrivacyRegion;
	width: number;
	height: number;
}) {
	const r = clampRegion(region);
	const w = r.width * width;
	const h = r.height * height;
	return {
		left: r.x * width,
		top: r.y * height,
		width: w,
		height: h,
		feather: r.feather * Math.min(w, h),
	};
}

/** Paints the region white on transparent: the mask the GPU uses. */
export function drawRegionMask({
	ctx,
	region,
	width,
	height,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	region: PrivacyRegion;
	width: number;
	height: number;
}) {
	const px = regionPixels({ region, width, height });
	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = "#fff";
	ctx.beginPath();
	if (region.shape === "ellipse")
		ctx.ellipse(
			px.left + px.width / 2,
			px.top + px.height / 2,
			px.width / 2,
			px.height / 2,
			0,
			0,
			Math.PI * 2,
		);
	else ctx.rect(px.left, px.top, px.width, px.height);
	ctx.fill();
}
