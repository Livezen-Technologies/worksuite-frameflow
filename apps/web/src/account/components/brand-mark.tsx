import { cn } from "@/utils/ui";

/** The FrameFlow app icon (same artwork as the installers, electron/build/icon.svg). */
export function BrandMark({ className }: { className?: string }) {
	return (
		// eslint-disable-next-line @next/next/no-img-element -- a small static SVG
		<img
			src="/brand/app-icon.svg"
			alt=""
			aria-hidden="true"
			draggable={false}
			className={cn("inline-block size-7 shrink-0 rounded-[7px]", className)}
		/>
	);
}
