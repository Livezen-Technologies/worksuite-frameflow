"use client";

import { useEffect, useState } from "react";
import { ease, transitionFrame, type TransitionFrame } from "../frame";
import type {
	TransitionDirection,
	TransitionEasing,
	TransitionType,
} from "../types";

const LOOP_MS = 1600;

function clipPath(frame: TransitionFrame): string | undefined {
	const mask = frame.mask;
	if (!mask) return undefined;
	if (mask.shape === "rectangle") {
		const left = (0.5 + mask.centerX - mask.width / 2) * 100;
		const right = (0.5 - mask.centerX - mask.width / 2) * 100;
		const top = (0.5 + mask.centerY - mask.height / 2) * 100;
		const bottom = (0.5 - mask.centerY - mask.height / 2) * 100;
		return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
	}
	if (mask.shape === "ellipse") {
		return `ellipse(${(mask.width / 2) * 100}% ${(mask.height / 2) * 100}% at 50% 50%)`;
	}
	const w = (mask.width / 2) * 100;
	const h = (mask.height / 2) * 100;
	return `polygon(50% ${50 - h}%, ${50 + w}% 50%, 50% ${50 + h}%, ${50 - w}% 50%)`;
}

function layerStyle({
	frame,
	color,
}: {
	frame: TransitionFrame;
	color: string;
}): React.CSSProperties {
	return {
		position: "absolute",
		inset: 0,
		background: color,
		opacity: frame.opacity,
		transform: `translate(${frame.offsetX * 100}%, ${frame.offsetY * 100}%) scale(${frame.scale}) rotate(${frame.rotate}deg)`,
		filter: frame.blur > 0 ? `blur(${frame.blur / 25}px)` : undefined,
		clipPath: clipPath(frame),
	};
}

/**
 * A two-clip preview of a transition drawn with the same maths the renderer
 * uses. Loops while `playing`, otherwise shows the halfway point.
 */
export function TransitionThumbnail({
	type,
	direction,
	easing,
	playing,
}: {
	type: TransitionType;
	direction: TransitionDirection;
	easing: TransitionEasing;
	playing: boolean;
}) {
	const [t, setT] = useState(0.5);

	useEffect(() => {
		if (!playing) return;
		let frameId = 0;
		const started = performance.now();
		const tick = (now: number) => {
			// Hold each end briefly so the cut reads clearly.
			const phase = ((now - started) % LOOP_MS) / LOOP_MS;
			setT(Math.min(1, Math.max(0, (phase - 0.15) / 0.7)));
			frameId = requestAnimationFrame(tick);
		};
		frameId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frameId);
	}, [playing]);

	const progress = ease({ easing, t: playing ? t : 0.5 });
	const out = transitionFrame({ type, role: "out", progress, direction });
	const incoming = transitionFrame({ type, role: "in", progress, direction });

	return (
		<span
			aria-hidden="true"
			className="relative block aspect-video overflow-hidden rounded-md bg-black"
		>
			<span style={layerStyle({ frame: out, color: "#2F5FB8" })}>
				<span className="absolute bottom-1 left-1.5 text-[9px] font-bold text-white/80">
					A
				</span>
			</span>
			<span style={layerStyle({ frame: incoming, color: "#C98A2E" })}>
				<span className="absolute right-1.5 bottom-1 text-[9px] font-bold text-black/70">
					B
				</span>
			</span>
		</span>
	);
}
