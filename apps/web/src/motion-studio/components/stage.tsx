"use client";

import { memo } from "react";
import { layerSize, pathD, valueAt, type Layer, type MotionProject } from "../model";

export function layerTransform({ layer, t }: { layer: Layer; t: number }): string {
	const { w, h } = layerSize(layer);
	const x = valueAt({ layer, prop: "x", t });
	const y = valueAt({ layer, prop: "y", t });
	const s = valueAt({ layer, prop: "scale", t });
	const r = valueAt({ layer, prop: "rotation", t });
	return `translate(${x} ${y}) rotate(${r}) scale(${s}) translate(${-layer.anchorX * w} ${-layer.anchorY * h})`;
}

function Shape({ layer }: { layer: Layer }) {
	switch (layer.kind) {
		case "rect":
			return (
				<rect
					width={layer.w}
					height={layer.h}
					rx={layer.radius}
					fill={layer.fill ?? "none"}
					stroke={layer.stroke ?? "none"}
					strokeWidth={layer.strokeWidth}
				/>
			);
		case "ellipse":
			return (
				<ellipse
					cx={layer.w / 2}
					cy={layer.h / 2}
					rx={layer.w / 2}
					ry={layer.h / 2}
					fill={layer.fill ?? "none"}
					stroke={layer.stroke ?? "none"}
					strokeWidth={layer.strokeWidth}
				/>
			);
		case "path":
			return (
				<path
					d={pathD(layer)}
					fill={layer.closed ? (layer.fill ?? "none") : "none"}
					stroke={layer.stroke ?? (layer.closed ? "none" : (layer.fill ?? "#fff"))}
					strokeWidth={layer.stroke || !layer.closed ? Math.max(1, layer.strokeWidth) : 0}
					strokeLinejoin="round"
					strokeLinecap="round"
				/>
			);
		case "text":
			return (
				<text
					fill={layer.fill}
					fontSize={layer.fontSize}
					fontFamily={`"${layer.fontFamily}", sans-serif`}
					fontWeight={layer.fontWeight}
					dominantBaseline="text-before-edge"
				>
					{layer.text.split("\n").map((line, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity
						<tspan key={i} x={0} y={i * layer.fontSize * 1.2}>
							{line || " "}
						</tspan>
					))}
				</text>
			);
		case "image":
			return <image href={layer.src} width={layer.w} height={layer.h} preserveAspectRatio="none" />;
	}
}

/** One layer drawn at time `t`. */
export const StageLayer = memo(function StageLayer({ layer, t }: { layer: Layer; t: number }) {
	if (!layer.visible) return null;
	return (
		<g
			transform={layerTransform({ layer, t })}
			opacity={valueAt({ layer, prop: "opacity", t })}
			data-motion-layer={layer.id}
		>
			<Shape layer={layer} />
		</g>
	);
});

/** The whole project at time `t`, as SVG content in project pixels. */
export function StageContent({ project, t }: { project: MotionProject; t: number }) {
	return (
		<>
			{project.background && <rect width={project.width} height={project.height} fill={project.background} />}
			{project.layers.map((layer) => (
				<StageLayer key={layer.id} layer={layer} t={t} />
			))}
		</>
	);
}

/** A static picture of a project (cards, thumbnails). */
export function StageThumbnail({ project, t = 0, className }: { project: MotionProject; t?: number; className?: string }) {
	return (
		<svg viewBox={`0 0 ${project.width} ${project.height}`} className={className} role="img" aria-label={project.name}>
			<StageContent project={project} t={t} />
		</svg>
	);
}
