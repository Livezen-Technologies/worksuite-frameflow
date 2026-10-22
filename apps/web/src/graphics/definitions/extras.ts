import type { ParamDefinition, ParamValues } from "@/params";
import type { GraphicDefinition } from "../types";

/** Shapes for the Elements sidebar beyond the basic four. */

const color = ({
	key,
	label,
	value,
}: {
	key: string;
	label: string;
	value: string;
}): ParamDefinition => ({
	key,
	label,
	type: "color",
	default: value,
});

const number = ({
	key,
	label,
	value,
	min,
	max,
	step = 1,
}: {
	key: string;
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
}): ParamDefinition => ({
	key,
	label,
	type: "number",
	default: value,
	min,
	max,
	step,
});

type Read<T> = { params: ParamValues; key: string; fallback: T };
const str = ({ params, key, fallback }: Read<string>) =>
	typeof params[key] === "string" ? String(params[key]) : fallback;
const num = ({ params, key, fallback }: Read<number>) =>
	typeof params[key] === "number" ? Number(params[key]) : fallback;

function strokeIfAny({
	ctx,
	params,
	path,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	params: ParamValues;
	path: Path2D;
}) {
	const width = num({ params, key: "strokeWidth", fallback: 0 });
	if (width <= 0) return;
	ctx.lineWidth = width;
	ctx.lineJoin = "round";
	ctx.strokeStyle = str({ params, key: "stroke", fallback: "#000000" });
	ctx.stroke(path);
}

export const arrowGraphicDefinition: GraphicDefinition = {
	id: "arrow",
	name: "Arrow",
	keywords: ["arrow", "pointer", "direction"],
	params: [
		color({ key: "fill", label: "Fill", value: "#ffffff" }),
		color({ key: "stroke", label: "Outline", value: "#000000" }),
		number({
			key: "strokeWidth",
			label: "Outline width",
			value: 0,
			min: 0,
			max: 40,
		}),
		number({
			key: "thickness",
			label: "Thickness (%)",
			value: 22,
			min: 4,
			max: 60,
		}),
		number({
			key: "head",
			label: "Head size (%)",
			value: 38,
			min: 10,
			max: 80,
		}),
	],
	render({ ctx, params, width, height }) {
		ctx.clearRect(0, 0, width, height);
		const cy = height / 2;
		const half =
			(num({ params, key: "thickness", fallback: 22 }) / 100) * height * 0.5;
		const head = (num({ params, key: "head", fallback: 38 }) / 100) * width;
		const headHalf = Math.min(height / 2 - 2, half * 2.4);
		const pad = width * 0.04;
		const path = new Path2D();
		path.moveTo(pad, cy - half);
		path.lineTo(width - pad - head, cy - half);
		path.lineTo(width - pad - head, cy - headHalf);
		path.lineTo(width - pad, cy);
		path.lineTo(width - pad - head, cy + headHalf);
		path.lineTo(width - pad - head, cy + half);
		path.lineTo(pad, cy + half);
		path.closePath();
		ctx.fillStyle = str({ params, key: "fill", fallback: "#ffffff" });
		ctx.fill(path);
		strokeIfAny({ ctx, params, path });
	},
};

export const lineGraphicDefinition: GraphicDefinition = {
	id: "line",
	name: "Line",
	keywords: ["line", "divider", "rule", "underline"],
	params: [
		color({ key: "stroke", label: "Color", value: "#ffffff" }),
		number({
			key: "thickness",
			label: "Thickness (%)",
			value: 4,
			min: 1,
			max: 30,
		}),
		{
			key: "dashed",
			label: "Dashed",
			type: "boolean",
			default: false,
		},
		{
			key: "rounded",
			label: "Rounded ends",
			type: "boolean",
			default: true,
		},
	],
	render({ ctx, params, width, height }) {
		ctx.clearRect(0, 0, width, height);
		const thickness =
			(num({ params, key: "thickness", fallback: 4 }) / 100) * height;
		ctx.lineWidth = thickness;
		ctx.lineCap = params.rounded === false ? "butt" : "round";
		ctx.strokeStyle = str({ params, key: "stroke", fallback: "#ffffff" });
		ctx.setLineDash(
			params.dashed === true ? [thickness * 2.5, thickness * 1.8] : [],
		);
		ctx.beginPath();
		ctx.moveTo(thickness, height / 2);
		ctx.lineTo(width - thickness, height / 2);
		ctx.stroke();
		ctx.setLineDash([]);
	},
};

export const speechBubbleGraphicDefinition: GraphicDefinition = {
	id: "speech-bubble",
	name: "Speech bubble",
	keywords: ["speech", "bubble", "callout", "comment", "chat"],
	params: [
		color({ key: "fill", label: "Fill", value: "#ffffff" }),
		color({ key: "stroke", label: "Outline", value: "#111827" }),
		number({
			key: "strokeWidth",
			label: "Outline width",
			value: 8,
			min: 0,
			max: 40,
		}),
		{
			key: "tail",
			label: "Tail",
			type: "select",
			default: "left",
			options: [
				{ value: "left", label: "Bottom left" },
				{ value: "right", label: "Bottom right" },
			],
		},
	],
	render({ ctx, params, width, height }) {
		ctx.clearRect(0, 0, width, height);
		const inset = num({ params, key: "strokeWidth", fallback: 8 }) / 2 + 2;
		const bodyBottom = height * 0.74;
		const radius = height * 0.16;
		const left = params.tail !== "right";
		const tailX = left ? width * 0.28 : width * 0.72;
		const path = new Path2D();
		path.moveTo(inset + radius, inset);
		path.lineTo(width - inset - radius, inset);
		path.quadraticCurveTo(width - inset, inset, width - inset, inset + radius);
		path.lineTo(width - inset, bodyBottom - radius);
		path.quadraticCurveTo(
			width - inset,
			bodyBottom,
			width - inset - radius,
			bodyBottom,
		);
		path.lineTo(tailX + width * 0.08, bodyBottom);
		path.lineTo(tailX + (left ? -width * 0.12 : width * 0.12), height - inset);
		path.lineTo(tailX - width * 0.06, bodyBottom);
		path.lineTo(inset + radius, bodyBottom);
		path.quadraticCurveTo(inset, bodyBottom, inset, bodyBottom - radius);
		path.lineTo(inset, inset + radius);
		path.quadraticCurveTo(inset, inset, inset + radius, inset);
		path.closePath();
		ctx.fillStyle = str({ params, key: "fill", fallback: "#ffffff" });
		ctx.fill(path);
		strokeIfAny({ ctx, params, path });
	},
};

export const heartGraphicDefinition: GraphicDefinition = {
	id: "heart",
	name: "Heart",
	keywords: ["heart", "love", "like"],
	params: [
		color({ key: "fill", label: "Fill", value: "#ff3d7f" }),
		color({ key: "stroke", label: "Outline", value: "#ffffff" }),
		number({
			key: "strokeWidth",
			label: "Outline width",
			value: 0,
			min: 0,
			max: 40,
		}),
	],
	render({ ctx, params, width, height }) {
		ctx.clearRect(0, 0, width, height);
		const w = width;
		const h = height;
		const path = new Path2D();
		path.moveTo(w / 2, h * 0.88);
		path.bezierCurveTo(
			w * 0.05,
			h * 0.58,
			w * 0.02,
			h * 0.2,
			w * 0.28,
			h * 0.14,
		);
		path.bezierCurveTo(w * 0.4, h * 0.11, w * 0.48, h * 0.2, w / 2, h * 0.28);
		path.bezierCurveTo(
			w * 0.52,
			h * 0.2,
			w * 0.6,
			h * 0.11,
			w * 0.72,
			h * 0.14,
		);
		path.bezierCurveTo(w * 0.98, h * 0.2, w * 0.95, h * 0.58, w / 2, h * 0.88);
		path.closePath();
		ctx.fillStyle = str({ params, key: "fill", fallback: "#ff3d7f" });
		ctx.fill(path);
		strokeIfAny({ ctx, params, path });
	},
};

export const gradientGraphicDefinition: GraphicDefinition = {
	id: "gradient",
	name: "Gradient",
	keywords: ["gradient", "overlay", "light leak", "fade"],
	params: [
		color({ key: "from", label: "From", value: "#ff7a18cc" }),
		color({ key: "to", label: "To", value: "#af002d00" }),
		number({ key: "angle", label: "Angle", value: 45, min: 0, max: 360 }),
		{
			key: "radial",
			label: "Radial",
			type: "boolean",
			default: false,
		},
	],
	render({ ctx, params, width, height }) {
		ctx.clearRect(0, 0, width, height);
		const from = str({ params, key: "from", fallback: "#ff7a18cc" });
		const to = str({ params, key: "to", fallback: "#af002d00" });
		let gradient: CanvasGradient;
		if (params.radial === true) {
			gradient = ctx.createRadialGradient(
				width / 2,
				height / 2,
				0,
				width / 2,
				height / 2,
				Math.hypot(width, height) / 2,
			);
		} else {
			const a = (num({ params, key: "angle", fallback: 45 }) * Math.PI) / 180;
			const r = Math.hypot(width, height) / 2;
			const dx = Math.cos(a) * r;
			const dy = Math.sin(a) * r;
			gradient = ctx.createLinearGradient(
				width / 2 - dx,
				height / 2 - dy,
				width / 2 + dx,
				height / 2 + dy,
			);
		}
		gradient.addColorStop(0, from);
		gradient.addColorStop(1, to);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
	},
};

export const frameGraphicDefinition: GraphicDefinition = {
	id: "frame",
	name: "Frame border",
	keywords: ["frame", "border", "outline", "box"],
	params: [
		color({ key: "stroke", label: "Color", value: "#ffffff" }),
		number({
			key: "thickness",
			label: "Thickness (%)",
			value: 3,
			min: 0.5,
			max: 20,
			step: 0.5,
		}),
		number({
			key: "margin",
			label: "Margin (%)",
			value: 4,
			min: 0,
			max: 20,
			step: 0.5,
		}),
		number({
			key: "cornerRadius",
			label: "Corner radius (%)",
			value: 3,
			min: 0,
			max: 30,
		}),
	],
	render({ ctx, params, width, height }) {
		ctx.clearRect(0, 0, width, height);
		const base = Math.min(width, height);
		const thickness =
			(num({ params, key: "thickness", fallback: 3 }) / 100) * base;
		const margin =
			(num({ params, key: "margin", fallback: 4 }) / 100) * base +
			thickness / 2;
		const radius =
			(num({ params, key: "cornerRadius", fallback: 3 }) / 100) * base;
		const path = new Path2D();
		path.roundRect(
			margin,
			margin,
			width - margin * 2,
			height - margin * 2,
			radius,
		);
		ctx.lineWidth = thickness;
		ctx.strokeStyle = str({ params, key: "stroke", fallback: "#ffffff" });
		ctx.stroke(path);
	},
};

export const extraGraphicDefinitions = [
	arrowGraphicDefinition,
	lineGraphicDefinition,
	speechBubbleGraphicDefinition,
	heartGraphicDefinition,
	gradientGraphicDefinition,
	frameGraphicDefinition,
];
