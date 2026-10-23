"use client";

import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import { TICKS_PER_SECOND } from "@/wasm";
import { frameRateToFloat } from "@/fps/utils";
import { modelFor, readModel } from "../models";
import type { RgbaFrame } from "../upscale";

function toFrame(canvas: HTMLCanvasElement): RgbaFrame {
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) throw new Error("Could not read the frame");
	return {
		rgba: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
		width: canvas.width,
		height: canvas.height,
	};
}

function toCanvas(frame: RgbaFrame): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = frame.width;
	canvas.height = frame.height;
	canvas
		.getContext("2d")
		?.putImageData(new ImageData(frame.rgba, frame.width, frame.height), 0, 0);
	return canvas;
}

/**
 * Before/after on the frame at the playhead (SRS EX-24), run on this
 * computer with the same model the export uses. A small area is used so
 * the example is quick.
 */
export function AiPreviewDialog({
	kind,
	onClose,
}: {
	/** null keeps the dialog mounted but closed, so it can clean up. */
	kind: "upscale" | "interpolate" | null;
	onClose: () => void;
}) {
	// The root stays mounted: unmounting an open nested dialog left the page
	// unclickable (pointer-events: none on body).
	return (
		<Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
			{kind && <AiPreviewContent kind={kind} />}
		</Dialog>
	);
}

function AiPreviewContent({ kind }: { kind: "upscale" | "interpolate" }) {
	const editor = useEditor();
	const [state, setState] = useState<"working" | "done" | string>("working");
	const [split, setSplit] = useState(50);
	const [urls, setUrls] = useState<{ before: string; after: string } | null>(
		null,
	);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const bytes = await readModel(modelFor(kind).id);
				if (!bytes) throw new Error("Download the model first.");
				const time = editor.playback.getCurrentTime();
				const maxSize = 360;
				if (kind === "upscale") {
					const frame = await editor.project.renderFrame({ time, maxSize });
					const { Upscaler } = await import("../upscale");
					const up = await Upscaler.create(bytes);
					const out = await up.upscale(toFrame(frame));
					up.release();
					if (!cancelled)
						setUrls({
							before: frame.toDataURL(),
							after: toCanvas(out).toDataURL(),
						});
				} else {
					const fps = frameRateToFloat(editor.project.getActive().settings.fps);
					const step = Math.round(TICKS_PER_SECOND / fps);
					const a = await editor.project.renderFrame({ time, maxSize });
					const b = await editor.project.renderFrame({
						time: time + step,
						maxSize,
					});
					const { Interpolator } = await import("../interpolate");
					const it = await Interpolator.create(bytes);
					const mid = await it.middle({ a: toFrame(a), b: toFrame(b) });
					it.release();
					if (!cancelled)
						setUrls({
							before: a.toDataURL(),
							after: toCanvas(mid).toDataURL(),
						});
				}
				if (!cancelled) setState("done");
			} catch (error) {
				if (!cancelled)
					setState(error instanceof Error ? error.message : String(error));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [editor, kind]);

	const beforeUrl = urls?.before;
	const afterUrl = urls?.after;

	return (
		<DialogContent className="max-w-3xl" aria-describedby={undefined}>
			<DialogHeader>
				<DialogTitle>
					{kind === "upscale" ? "AI Ultra HD example" : "Optical flow example"}
				</DialogTitle>
			</DialogHeader>
			{state === "working" ? (
				<p className="text-muted-foreground text-sm">
					Running on this computer…
				</p>
			) : state !== "done" ? (
				<p className="text-sm text-red-500">{state}</p>
			) : kind === "upscale" && beforeUrl && afterUrl ? (
				<div className="flex flex-col gap-2" data-ai-preview="upscale">
					<div className="relative overflow-hidden rounded-md border">
						{/* eslint-disable-next-line @next/next/no-img-element -- local canvas output */}
						<img src={afterUrl} alt="After" className="block w-full" />
						<div
							className="absolute inset-y-0 left-0 overflow-hidden"
							style={{ width: `${split}%` }}
						>
							{/* eslint-disable-next-line @next/next/no-img-element -- local canvas output */}
							<img
								src={beforeUrl}
								alt="Before"
								className="block h-full max-w-none"
								style={{
									width: `${10000 / Math.max(1, split)}%`,
									imageRendering: "auto",
								}}
							/>
						</div>
						<div
							className="absolute inset-y-0 w-px bg-white"
							style={{ left: `${split}%` }}
						/>
					</div>
					<Slider
						min={0}
						max={100}
						value={[split]}
						onValueChange={([v]) => setSplit(v ?? 50)}
						aria-label="Before and after"
					/>
					<p className="text-muted-foreground m-0 text-xs">
						Left: before (scaled up normally). Right: AI Ultra HD.
					</p>
				</div>
			) : beforeUrl && afterUrl ? (
				<div className="grid grid-cols-2 gap-2" data-ai-preview="interpolate">
					<figure className="m-0">
						{/* eslint-disable-next-line @next/next/no-img-element -- local canvas output */}
						<img
							src={beforeUrl}
							alt="Frame at the playhead"
							className="w-full rounded-md border"
						/>
						<figcaption className="text-muted-foreground text-xs">
							This frame
						</figcaption>
					</figure>
					<figure className="m-0">
						{/* eslint-disable-next-line @next/next/no-img-element -- local canvas output */}
						<img
							src={afterUrl}
							alt="In-between frame"
							className="w-full rounded-md border"
						/>
						<figcaption className="text-muted-foreground text-xs">
							New in-between frame
						</figcaption>
					</figure>
				</div>
			) : null}
		</DialogContent>
	);
}
