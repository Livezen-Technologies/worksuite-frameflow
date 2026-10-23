"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { falseColour, NITS_GUIDES, nitsWaveform } from "@/hdr/light-level";
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

type HdrScope = "nits" | "false-colour";

/** The HDR working signal at the playhead, sampled while an HDR scope shows. */
function useSignalFrame(enabled: boolean): Frame | null {
	const editor = useEditor();
	const [frame, setFrame] = useState<Frame | null>(null);
	useEffect(() => {
		if (!enabled) return;
		let stopped = false;
		let busy = false;
		const sample = async () => {
			if (busy) return;
			busy = true;
			try {
				const canvas = await editor.project.renderFrame({
					time: editor.playback.getCurrentTime(),
					maxSize: SAMPLE_WIDTH,
					signal: true,
				});
				const ctx = canvas.getContext("2d", { willReadFrequently: true });
				if (!ctx || stopped) return;
				const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
				setFrame({ width: canvas.width, height: canvas.height, data });
			} catch {
				// Nothing to render yet.
			} finally {
				busy = false;
			}
		};
		void sample();
		const timer = window.setInterval(() => void sample(), 700);
		return () => {
			stopped = true;
			window.clearInterval(timer);
		};
	}, [enabled, editor]);
	return frame;
}

/** Luminance waveform on a PQ (0–10,000 nit) axis with 100 / 203 / 1,000 nit lines (HD-10). */
function drawNitsWaveform({
	ctx,
	frame,
}: {
	ctx: CanvasRenderingContext2D;
	frame: Frame;
}) {
	const counts = nitsWaveform(frame);
	const xScale = DRAW_WIDTH / frame.width;
	for (let x = 0; x < frame.width; x++)
		for (let level = 0; level < 256; level++) {
			const count = counts[x * 256 + level];
			if (!count) continue;
			ctx.fillStyle = `rgba(250,200,90,${Math.min(1, 0.15 + count / 6)})`;
			ctx.fillRect(
				x * xScale,
				DRAW_HEIGHT - (level / 255) * DRAW_HEIGHT,
				Math.max(1, xScale),
				1,
			);
		}
	ctx.font = "10px system-ui";
	for (const guide of NITS_GUIDES) {
		const y = DRAW_HEIGHT - guide.level * DRAW_HEIGHT;
		ctx.strokeStyle =
			guide.nits === 203 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)";
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(DRAW_WIDTH, y);
		ctx.stroke();
		ctx.fillStyle = "rgba(255,255,255,0.7)";
		ctx.fillText(`${guide.nits.toLocaleString()} nits`, 4, Math.max(10, y - 2));
	}
}

/** Over 1,000 nits red, highlights yellow, outside Rec. 709 magenta (HD-10). */
function drawFalseColour({
	ctx,
	frame,
}: {
	ctx: CanvasRenderingContext2D;
	frame: Frame;
}) {
	const image = new ImageData(falseColour(frame), frame.width, frame.height);
	const tmp = document.createElement("canvas");
	tmp.width = frame.width;
	tmp.height = frame.height;
	tmp.getContext("2d")?.putImageData(image, 0, 0);
	const scale = Math.min(DRAW_WIDTH / frame.width, DRAW_HEIGHT / frame.height);
	const w = frame.width * scale;
	const h = frame.height * scale;
	ctx.drawImage(tmp, (DRAW_WIDTH - w) / 2, (DRAW_HEIGHT - h) / 2, w, h);
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
	const [kind, setKind] = useState<ScopeKind | HdrScope>("waveform");
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const colorSpace = useEditor(
		(e) => e.project.getActiveOrNull()?.settings.colorSpace,
	);
	const hdrProject = colorSpace === "hlg" || colorSpace === "pq";
	const hdrScope = hdrProject && (kind === "nits" || kind === "false-colour");
	const sampled = useSampledFrame(!hdrScope);
	const signal = useSignalFrame(hdrScope);
	const frame = hdrScope ? signal : sampled;
	const kinds: { kind: ScopeKind | HdrScope; label: string }[] = [
		...SCOPE_KINDS,
		...(hdrProject
			? [
					{ kind: "nits" as const, label: "Nits" },
					{ kind: "false-colour" as const, label: "False colour" },
				]
			: []),
	];

	useEffect(() => {
		const ctx = canvasRef.current?.getContext("2d");
		if (!ctx) return;
		ctx.fillStyle = "#0A0C0F";
		ctx.fillRect(0, 0, DRAW_WIDTH, DRAW_HEIGHT);
		if (!frame) return;
		if (kind === "nits") drawNitsWaveform({ ctx, frame });
		if (kind === "false-colour") drawFalseColour({ ctx, frame });
		if (kind === "waveform") drawWaveform({ ctx, frame, channels: ["luma"] });
		if (kind === "parade") drawWaveform({ ctx, frame, channels: [0, 1, 2] });
		if (kind === "histogram") drawHistogram({ ctx, frame });
		if (kind === "vectorscope") drawVectorscope({ ctx, frame });
	}, [frame, kind]);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-1" role="tablist" aria-label="Scope">
				{kinds.map((scope) => (
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
			{kind === "false-colour" && (
				<p
					className="text-muted-foreground m-0 text-[11px]"
					data-false-colour-key
				>
					<span className="text-red-400">■</span> over 1,000 nits ·{" "}
					<span className="text-yellow-300">■</span> brighter than graphics
					white · <span className="text-fuchsia-400">■</span> outside Rec. 709
				</p>
			)}
			<canvas
				ref={canvasRef}
				width={DRAW_WIDTH}
				height={DRAW_HEIGHT}
				role="img"
				aria-label={`${kinds.find((s) => s.kind === kind)?.label} of the current frame`}
				data-scope-kind={kind}
				className="w-full rounded-md border"
				style={{ aspectRatio: `${DRAW_WIDTH} / ${DRAW_HEIGHT}` }}
			/>
		</div>
	);
}
