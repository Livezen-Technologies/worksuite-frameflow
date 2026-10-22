import type { ParamValues } from "@/params";
import type { WatermarkCorner } from "./store";

/**
 * Where a logo `size`% of the frame width sits in a corner, as transform
 * params for an image element (which is first contained in the frame).
 */
export function watermarkTransform({
	frame,
	image,
	corner,
	size,
}: {
	frame: { width: number; height: number };
	image: { width: number; height: number };
	corner: WatermarkCorner;
	size: number;
}): ParamValues {
	const contain = Math.min(
		frame.width / image.width,
		frame.height / image.height,
	);
	const targetWidth = (size / 100) * frame.width;
	const scale = targetWidth / (image.width * contain);
	const drawnHeight = image.height * contain * scale;
	const margin = Math.round(frame.height * 0.04);
	const x = frame.width / 2 - margin - targetWidth / 2;
	const y = frame.height / 2 - margin - drawnHeight / 2;
	return {
		"transform.scaleX": scale,
		"transform.scaleY": scale,
		"transform.positionX": Math.round(corner.endsWith("left") ? -x : x),
		"transform.positionY": Math.round(corner.startsWith("top") ? -y : y),
	};
}
