"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/utils/ui";

const LOADER_URL = "/brand/frameflow-loader.json";

/**
 * The FrameFlow loading animation. Plays with lottie-web's light SVG build,
 * which has no expression engine; falls back to a spinner if it can't load.
 */
export function BrandLoader({ size = 96, className }: { size?: number; className?: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		let cancelled = false;
		let destroy: (() => void) | null = null;
		void Promise.all([
			import("lottie-web/build/player/lottie_light"),
			fetch(LOADER_URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
		])
			.then(([{ default: lottie }, animationData]: [{ default: import("lottie-web").LottiePlayer }, unknown]) => {
				if (cancelled || !ref.current) return;
				const animation = lottie.loadAnimation({
					container: ref.current,
					renderer: "svg",
					loop: true,
					autoplay: true,
					animationData,
				});
				destroy = () => animation.destroy();
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
			destroy?.();
		};
	}, []);
	if (failed) return <Loader2 className={cn("text-muted-foreground animate-spin", className)} style={{ width: size / 3, height: size / 3 }} />;
	return <div ref={ref} role="status" aria-label="Loading" className={className} style={{ width: size, height: size }} data-brand-loader />;
}
