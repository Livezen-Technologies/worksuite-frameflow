"use client";

import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { buildEffectElement } from "@/timeline/element-utils";
import { DEFAULT_REGION } from "../region";

/** One click to hide private data: an effect clip over one area (ED-15). */
export function PrivacyButtons() {
	const editor = useEditor();
	const add = (effectType: "blur" | "pixelate") => {
		const element = buildEffectElement({
			effectType,
			startTime: editor.playback.getCurrentTime(),
		});
		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "effect" },
			element: { ...element, region: DEFAULT_REGION },
		});
	};
	return (
		<div className="flex gap-2">
			<Button
				size="sm"
				variant="outline"
				className="flex-1"
				onClick={() => add("blur")}
				data-privacy-add="blur"
			>
				Blur an area
			</Button>
			<Button
				size="sm"
				variant="outline"
				className="flex-1"
				onClick={() => add("pixelate")}
				data-privacy-add="pixelate"
			>
				Pixelate an area
			</Button>
		</div>
	);
}
