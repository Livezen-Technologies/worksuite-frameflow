import type { MaskDefinition } from "@/masks/types";
import {
	BOX_LIKE_MASK_PARAMS,
	buildBoxMaskInteraction,
	computeBoxMaskParamUpdate,
	getBoxLikeGeometry,
	getDefaultSquareMaskParams,
	getStrokeOffset,
	rotatePoint,
} from "../box-like";

function buildRectanglePath({
	centerX,
	centerY,
	halfWidth,
	halfHeight,
	rotationRad,
	radius = 0,
}: {
	centerX: number;
	centerY: number;
	halfWidth: number;
	halfHeight: number;
	rotationRad: number;
	/** Corner radius in pixels. */
	radius?: number;
}): Path2D {
	const corners = [
		{ x: centerX - halfWidth, y: centerY - halfHeight },
		{ x: centerX + halfWidth, y: centerY - halfHeight },
		{ x: centerX + halfWidth, y: centerY + halfHeight },
		{ x: centerX - halfWidth, y: centerY + halfHeight },
	].map((point) =>
		rotatePoint({
			...point,
			centerX,
			centerY,
			rotationRad,
		}),
	);

	const path = new Path2D();
	const r = Math.min(Math.max(0, radius), halfWidth, halfHeight);
	if (r <= 0) {
		path.moveTo(corners[0].x, corners[0].y);
		for (const corner of corners.slice(1)) {
			path.lineTo(corner.x, corner.y);
		}
		path.closePath();
		return path;
	}
	// Start halfway along the last edge, then round each corner with arcTo.
	const last = corners[3];
	path.moveTo((last.x + corners[0].x) / 2, (last.y + corners[0].y) / 2);
	for (let i = 0; i < 4; i++) {
		const corner = corners[i];
		const next = corners[(i + 1) % 4];
		path.arcTo(corner.x, corner.y, next.x, next.y, r);
	}
	path.closePath();
	return path;
}

export const rectangleMaskDefinition: MaskDefinition<"rectangle"> = {
	type: "rectangle",
	name: "Rectangle",
	features: {
		hasPosition: true,
		hasRotation: true,
		sizeMode: "width-height",
	},
	params: [
		...BOX_LIKE_MASK_PARAMS,
		{
			key: "cornerRadius",
			label: "Round corners",
			type: "number",
			default: 0,
			min: 0,
			max: 50,
			displayMultiplier: 100,
			step: 1,
		},
	],
	interaction: buildBoxMaskInteraction({
		sizeMode: "width-height",
	}),
	buildDefault(context) {
		return {
			type: "rectangle",
			params: getDefaultSquareMaskParams(context),
		};
	},
	computeParamUpdate: computeBoxMaskParamUpdate,
	renderer: {
		body: {
			kind: "fillPath",
			buildPath({ resolvedParams, width, height }) {
				const params = resolvedParams;
				const { centerX, centerY, maskWidth, maskHeight, rotationRad } =
					getBoxLikeGeometry({ params, width, height });
				return buildRectanglePath({
					centerX,
					centerY,
					halfWidth: maskWidth / 2,
					halfHeight: maskHeight / 2,
					rotationRad,
					radius: (params.cornerRadius ?? 0) * Math.min(maskWidth, maskHeight),
				});
			},
		},
		stroke: {
			kind: "strokeFromPath",
			buildStrokePath({ resolvedParams, width, height }) {
				const params = resolvedParams;
				const { centerX, centerY, maskWidth, maskHeight, rotationRad } =
					getBoxLikeGeometry({ params, width, height });
				const offset = getStrokeOffset({
					strokeAlign: params.strokeAlign,
					strokeWidth: params.strokeWidth,
				});
				return buildRectanglePath({
					centerX,
					centerY,
					halfWidth: Math.max(1, maskWidth / 2 + offset),
					halfHeight: Math.max(1, maskHeight / 2 + offset),
					rotationRad,
					radius: (params.cornerRadius ?? 0) * Math.min(maskWidth, maskHeight) + offset,
				});
			},
		},
	},
};
