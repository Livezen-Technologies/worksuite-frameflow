"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/ui";
import { addFrameTap } from "@/services/renderer/frame-taps";
import {
	histogram,
	SCOPE_KINDS,
	SKIN_TONE_ANGLE_DEGREES,
	vectorscope,
	waveform,
	type Frame,
	type ScopeKind,
} from "../scopes";

const SAMPLE_WIDTH = 192;
const SAMPLE_HEIGHT = 108;
const DRAW_WIDTH = 320;
const DRAW_HEIGHT = 180;
const REFRESH_MS = 200;

/** Samples rendered frames, downscaled, at most five times a second. */
function useSampledFrame(enabled: boolean): Frame | null {
	const [frame, setFrame] = useState<Frame | null>(null);

	useEffect(() => {
		if (!enabled) return;
		const sample = document.createElement("canvas");
		sample.width = SAMPLE_WIDTH;
		sample.height = SAMPLE_HEIGHT;
		const ctx = sample.getContext("2d", { willReadFrequently: true });
		if (!ctx) return;
		let last = 0;
		return addFrameTap((source) => {
			const now = performance.now();
			if (now - last < REFRESH_MS || source.width === 0) return;
			last = now;
			ctx.clearRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
			ctx.drawImage(source, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
			const { data } = ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
			setFrame({ width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT, data });
		});
	}, [enabled]);

	return frame;
}

function drawWaveform({
	ctx,
	frame,
	channels,
}: {
	ctx: CanvasRenderingContext2D;
	frame: Frame;
	channels: ("luma" | 0 | 1 | 2)[];
}) {
	const colors: Record<string, string> = {
		luma: "120,220,160",
		0: "240,90,90",
		1: "90,220,120",
		2: "100,140,255",
	};
	const columnWidth = DRAW_WIDTH / channels.length;
	channels.forEach((channel, index) => {
		const counts = waveform({ frame, channel });
		const xScale = columnWidth / frame.width;
		for (let x = 0; x < frame.width; x++) {
			for (let level = 0; level < 256; level++) {
				const count = counts[x * 256 + level];
				if (!count) continue;
				ctx.fillStyle = `rgba(${colors[String(channel)]},${Math.min(1, 0.15 + count / 6)})`;
				ctx.fillRect(
					index * columnWidth + x * xScale,
					DRAW_HEIGHT - (level / 255) * DRAW_HEIGHT,
					Math.max(1, xScale),
					1,
				);
			}
		}
	});
	ctx.strokeStyle = "rgba(255,255,255,0.12)";
	for (const level of [0, 0.25, 0.5, 0.75, 1]) {
		const y = DRAW_HEIGHT - level * DRAW_HEIGHT + 0.5;
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(DRAW_WIDTH, y);
		ctx.stroke();
	}
}

function drawHistogram({
	ctx,
	frame,
}: {
	ctx: CanvasRenderingContext2D;
	frame: Frame;
}) {
	const h = histogram(frame);
	const max = Math.max(1, ...h.r, ...h.g, ...h.b);
	ctx.globalCompositeOperation = "lighter";
	for (const [channel, color] of [
		[h.r, "rgba(240,90,90,0.7)"],
		[h.g, "rgba(90,220,120,0.7)"],
		[h.b, "rgba(100,140,255,0.7)"],
	] as const) {
		ctx.fillStyle = color;
		for (let level = 0; level < 256; level++) {
			const height = (channel[level] / max) * DRAW_HEIGHT;
			ctx.fillRect(
				(level / 256) * DRAW_WIDTH,
				DRAW_HEIGHT - height,
				DRAW_WIDTH / 256 + 0.5,
				height,
			);
		}
	}
	ctx.globalCompositeOperation = "source-over";
}

function drawVectorscope({
	ctx,
	frame,
}: {
	ctx: CanvasRenderingContext2D;
	frame: Frame;
}) {
	const size = 128;
	const counts = vectorscope({ frame, size });
	const scale = DRAW_HEIGHT / size;
	const left = (DRAW_WIDTH - DRAW_HEIGHT) / 2;
	ctx.strokeStyle = "rgba(255,255,255,0.15)";
	ctx.beginPath();
	ctx.arc(DRAW_WIDTH / 2, DRAW_HEIGHT / 2, DRAW_HEIGHT / 2 - 1, 0, Math.PI * 2);
	ctx.stroke();
	// Skin-tone line
	const angle = (SKIN_TONE_ANGLE_DEGREES * Math.PI) / 180;
	ctx.strokeStyle = "rgba(245,165,36,0.5)";
	ctx.beginPath();
	ctx.moveTo(DRAW_WIDTH / 2, DRAW_HEIGHT / 2);
	ctx.lineTo(
		DRAW_WIDTH / 2 + Math.cos(angle) * DRAW_HEIGHT * 0.5,
		DRAW_HEIGHT / 2 - Math.sin(angle) * DRAW_HEIGHT * 0.5,
	);
	ctx.stroke();
	for (let i = 0; i < counts.length; i++) {
		if (!counts[i]) continue;
		ctx.fillStyle = `rgba(120,220,160,${Math.min(1, 0.2 + counts[i] / 8)})`;
		ctx.fillRect(
			left + (i % size) * scale,
			Math.floor(i / size) * scale,
			Math.max(1, scale),
			Math.max(1, scale),
		);
	}
}

/** Waveform, RGB parade, histogram and vectorscope of the preview (WS-10). */
export function ScopesView() {
	const [kind, setKind] = useState<ScopeKind>("waveform");
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const frame = useSampledFrame(true);

	useEffect(() => {
		const ctx = canvasRef.current?.getContext("2d");
		if (!ctx) return;
		ctx.fillStyle = "#0A0C0F";
		ctx.fillRect(0, 0, DRAW_WIDTH, DRAW_HEIGHT);
		if (!frame) return;
		if (kind === "waveform") drawWaveform({ ctx, frame, channels: ["luma"] });
		if (kind === "parade") drawWaveform({ ctx, frame, channels: [0, 1, 2] });
		if (kind === "histogram") drawHistogram({ ctx, frame });
		if (kind === "vectorscope") drawVectorscope({ ctx, frame });
	}, [frame, kind]);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-1" role="tablist" aria-label="Scope">
				{SCOPE_KINDS.map((scope) => (
					<button
						key={scope.kind}
						type="button"
						role="tab"
						aria-selected={kind === scope.kind}
						onClick={() => setKind(scope.kind)}
						className={cn(
							"h-7 rounded-md px-2.5 text-[11px] font-semibold",
							kind === scope.kind
								? "bg-secondary text-secondary-foreground"
								: "text-muted-foreground hover:bg-accent",
						)}
					>
						{scope.label}
					</button>
				))}
			</div>
			<canvas
				ref={canvasRef}
				width={DRAW_WIDTH}
				height={DRAW_HEIGHT}
				role="img"
				aria-label={`${SCOPE_KINDS.find((s) => s.kind === kind)?.label} of the current frame`}
				className="w-full rounded-md border"
				style={{ aspectRatio: `${DRAW_WIDTH} / ${DRAW_HEIGHT}` }}
			/>
		</div>
	);
}
