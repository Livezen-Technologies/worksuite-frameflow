"use client";

import { useEffect, useRef } from "react";
import type { TextContext } from "@/text-animation/render";

/**
 * A library thumbnail drawn by the engine itself. It draws one still frame
 * when it first scrolls into view (lazy) and plays in a loop only while
 * `playing` (hover), so hundreds of tiles stay cheap.
 */
export function PreviewCanvas({
	draw,
	drawKey,
	duration,
	width = 160,
	height = 90,
	playing,
	stillAt,
	className,
}: {
	/** Draws the frame at `time` (seconds) into a width×height box. */
	draw: (ctx: TextContext, time: number) => void;
	/** Changes when what `draw` shows changes. */
	drawKey: string;
	duration: number;
	width?: number;
	height?: number;
	playing: boolean;
	stillAt?: number;
	className?: string;
}) {
	const ref = useRef<HTMLCanvasElement>(null);
	const visible = useRef(false);
	const drawRef = useRef(draw);
	drawRef.current = draw;

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const paint = (t: number) => {
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, width, height);
			try {
				drawRef.current(ctx, t);
			} catch (error) {
				console.warn("Text preview failed", error);
			}
		};
		if (playing) {
			let frame = 0;
			const start = performance.now();
			const tick = (now: number) => {
				paint(((now - start) / 1000) % (duration + 0.5));
				frame = requestAnimationFrame(tick);
			};
			frame = requestAnimationFrame(tick);
			return () => cancelAnimationFrame(frame);
		}
		const still = () => paint(stillAt ?? Math.min(duration * 0.55, 1.6));
		if (visible.current || typeof IntersectionObserver === "undefined") {
			still();
			return;
		}
		const observer = new IntersectionObserver((entries) => {
			if (!entries.some((e) => e.isIntersecting)) return;
			visible.current = true;
			observer.disconnect();
			still();
			// Sinhala/Tamil fonts may still be loading; draw again once they are.
			document.fonts?.ready.then(still).catch(() => {});
		});
		observer.observe(canvas);
		return () => observer.disconnect();
	}, [drawKey, playing, width, height, duration, stillAt]);

	return <canvas ref={ref} style={{ width, height, display: "block" }} className={className} aria-hidden />;
}
