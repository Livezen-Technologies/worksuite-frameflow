"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeColorMap, recolorLottie } from "../colors";
import {
	canvasAnimationConfig,
	loadLottieJson,
	loadLottieRuntime,
	lottieSourceFromKey,
	lottieSourceKey,
} from "../player";
import type { LottieSource } from "../types";
import { cn } from "@/utils/ui";

/**
 * A library tile: the static thumbnail (or a still frame when there is
 * none), and the live animation (lottie-web, canvas renderer) while
 * `playing`, e.g. on hover.
 */
export function LottiePreview({
	source,
	thumbnailUrl,
	playing,
	colors,
	className,
}: {
	source: LottieSource;
	thumbnailUrl?: string;
	playing: boolean;
	colors?: Record<string, string>;
	className?: string;
}) {
	const hostRef = useRef<HTMLDivElement>(null);
	const [live, setLive] = useState(false);
	const colorKey = JSON.stringify(normalizeColorMap(colors ?? {}));
	const sourceKey = lottieSourceKey(source);

	useEffect(() => {
		const host = hostRef.current;
		// Without a thumbnail, a still frame stands in until hover.
		const still = !playing && !thumbnailUrl;
		if ((!playing && !still) || !host) return;
		let cancelled = false;
		let destroy: (() => void) | null = null;
		(async () => {
			try {
				const [lottie, json] = await Promise.all([loadLottieRuntime(), loadLottieJson(lottieSourceFromKey(sourceKey))]);
				if (cancelled) return;
				const ratio = window.devicePixelRatio || 1;
				const box = host.getBoundingClientRect();
				const canvas = document.createElement("canvas");
				// Sized once before loading; lottie-web's canvas renderer must not be resized.
				canvas.width = Math.max(1, Math.round(box.width * ratio));
				canvas.height = Math.max(1, Math.round(box.height * ratio));
				canvas.className = "absolute inset-0 size-full";
				const context = canvas.getContext("2d");
				if (!context) return;
				host.appendChild(canvas);
				const animation = lottie.loadAnimation(canvasAnimationConfig({
					renderer: "canvas",
					loop: true,
					autoplay: !still,
					animationData: recolorLottie(json, JSON.parse(colorKey)),
					rendererSettings: { context, clearCanvas: true, preserveAspectRatio: "xMidYMid meet" },
				}));
				if (still) animation.goToAndStop((json.op - json.ip) * 0.6, true);
				setLive(true);
				destroy = () => {
					animation.destroy();
					canvas.remove();
				};
			} catch {
				// Keep showing the thumbnail.
			}
		})();
		return () => {
			cancelled = true;
			destroy?.();
			setLive(false);
		};
	}, [playing, sourceKey, colorKey, thumbnailUrl]);

	return (
		<div ref={hostRef} className={cn("relative size-full", className)}>
			{thumbnailUrl && (
				// eslint-disable-next-line @next/next/no-img-element -- static file from the bundled pack
				<img
					src={thumbnailUrl}
					alt=""
					draggable={false}
					loading="lazy"
					className={cn("absolute inset-0 size-full object-contain", live && "invisible")}
				/>
			)}
		</div>
	);
}
