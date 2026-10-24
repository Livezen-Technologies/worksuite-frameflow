"use client";

import { AudioLines, Clapperboard } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/utils/ui";
import { useStudioStore } from "../store";

/** Header switch between the video editor and the Audio Studio (same project). */
export function StudioSwitch() {
	const studio = useStudioStore((s) => s.studio);
	const setStudio = useStudioStore((s) => s.setStudio);
	// ?studio=audio (from the home sidebar) opens straight into the Audio Studio.
	useEffect(() => {
		const wanted = new URLSearchParams(window.location.search).get("studio");
		setStudio(wanted === "audio" ? "audio" : "video");
	}, [setStudio]);
	return (
		<div className="bg-accent/60 flex rounded-md p-0.5 text-xs" data-studio-switch>
			{(
				[
					["video", "Video", Clapperboard],
					["audio", "Audio", AudioLines],
				] as const
			).map(([id, label, Icon]) => (
				<button
					key={id}
					type="button"
					onClick={() => setStudio(id)}
					aria-pressed={studio === id}
					title={id === "audio" ? "Music & Audio Editor: tracks, EQ, clean-up, meters" : "Video editor"}
					className={cn(
						"flex items-center gap-1.5 rounded px-2.5 py-1",
						studio === id ? "bg-background text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground",
					)}
					data-studio={id}
				>
					<Icon className="size-3.5" /> {label}
				</button>
			))}
		</div>
	);
}
