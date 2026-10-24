"use client";

import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import { getElementPitch } from "@/timeline/audio-state";
import type { AudioElement, VideoElement } from "@/timeline/types";
import { cn } from "@/utils/ui";

/** Pitch presets; each one moves the voice up or down without changing its speed. */
export const VOICE_PRESETS: { id: string; label: string; semitones: number; emoji: string }[] = [
	{ id: "none", label: "None", semitones: 0, emoji: "🚫" },
	{ id: "chipmunk", label: "Chipmunk", semitones: 8, emoji: "🐿️" },
	{ id: "child", label: "Child", semitones: 5, emoji: "🧒" },
	{ id: "female", label: "Higher", semitones: 3, emoji: "🎤" },
	{ id: "male", label: "Lower", semitones: -3, emoji: "🎙️" },
	{ id: "deep", label: "Deep", semitones: -6, emoji: "🐻" },
	{ id: "giant", label: "Giant", semitones: -9, emoji: "🗿" },
	{ id: "monster", label: "Monster", semitones: -12, emoji: "👹" },
];

/** Audio › Voice changer: presets plus a fine pitch control, applied in preview and export. */
export function VoiceChangerTab({ element, trackId }: { element: AudioElement | VideoElement; trackId: string }) {
	const editor = useEditor();
	const pitch = getElementPitch({ element });
	const set = (semitones: number) =>
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, patch: { params: { ...element.params, voicePitch: semitones } } }],
		});
	return (
		<div className="flex flex-col gap-4 p-4 text-sm" data-voice-changer>
			<div className="grid grid-cols-4 gap-2">
				{VOICE_PRESETS.map((preset) => (
					<button
						key={preset.id}
						type="button"
						onClick={() => set(preset.semitones)}
						className="group flex flex-col items-center gap-1.5"
						aria-pressed={pitch === preset.semitones}
						data-voice-preset={preset.id}
					>
						<span
							className={cn(
								"bg-accent/60 flex aspect-square w-full items-center justify-center rounded-lg border-2 border-transparent text-2xl transition group-hover:bg-accent",
								pitch === preset.semitones && "border-primary",
							)}
						>
							{preset.emoji}
						</span>
						<span className="text-muted-foreground truncate text-xs">{preset.label}</span>
					</button>
				))}
			</div>
			<div className="flex flex-col gap-2 border-t pt-4">
				<div className="flex justify-between">
					<span className="font-semibold">Pitch</span>
					<span className="text-muted-foreground tabular-nums">
						{pitch > 0 ? "+" : ""}
						{pitch} semitones
					</span>
				</div>
				<Slider min={-12} max={12} step={1} value={[pitch]} onValueChange={([v]) => set(v ?? 0)} />
				<p className="text-muted-foreground m-0 text-xs">The speed stays the same; you hear it in the preview and the export.</p>
			</div>
		</div>
	);
}
