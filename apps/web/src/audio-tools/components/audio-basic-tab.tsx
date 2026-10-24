"use client";

import { ChevronRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ElementParamsTab } from "@/components/editor/panels/properties/components/element-params-tab";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/editor/use-editor";
import { decodeAudioToFloat32 } from "@/media/audio";
import type { ParamValues } from "@/params";
import { getElementFades } from "@/timeline/audio-state";
import type { AudioElement } from "@/timeline/types";
import { cn } from "@/utils/ui";
import { addMediaTime, mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";
import { cleanUpClipVoice, restoreOriginalVoice } from "../actions";
import { detectBeats } from "../beats";
import { VoiceTab } from "./voice-tab";

const BEAT_SAMPLE_RATE = 22050;

/**
 * Audio › Basic (CapCut-style): volume, fade in and out, noise reduction,
 * beats detection (marks the beats on the timeline) and voice enhancing.
 */
export function AudioBasicTab({ element, trackId }: { element: AudioElement; trackId: string }) {
	const editor = useEditor();
	const [busy, setBusy] = useState<"noise" | "beats" | null>(null);
	const [enhanceOpen, setEnhanceOpen] = useState(false);
	const { fadeIn, fadeOut } = getElementFades({ element });
	const seconds = element.duration / TICKS_PER_SECOND;
	const maxFade = Math.max(0.1, Math.min(10, Math.floor((seconds / 2) * 10) / 10));
	const beatsOn = element.params.beats === true;

	const write = (patch: ParamValues) =>
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, patch: { params: { ...element.params, ...patch } } }],
		});

	const toggleNoise = async (on: boolean) => {
		setBusy("noise");
		try {
			if (on) {
				await cleanUpClipVoice({ editor, element });
				toast.success("Background noise reduced");
			} else restoreOriginalVoice({ editor, element });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Couldn't reduce the noise");
		} finally {
			setBusy(null);
		}
	};

	const toggleBeats = async (on: boolean) => {
		const marked = String(element.params.beatMarks ?? "")
			.split(",")
			.map(Number)
			.filter((n) => Number.isFinite(n) && n > 0);
		if (!on) {
			for (const ticks of marked) await editor.scenes.removeBookmark({ time: mediaTimeFromSeconds({ seconds: ticks / TICKS_PER_SECOND }) });
			write({ beats: false, beatMarks: "" });
			return;
		}
		if (element.sourceType !== "upload") {
			toast.error("Beats can be found on your own audio files");
			return;
		}
		const asset = editor.media.getAssets().find((a) => a.id === element.mediaId);
		if (!asset?.file) return;
		setBusy("beats");
		try {
			const { samples } = await decodeAudioToFloat32({ audioBlob: asset.file, sampleRate: BEAT_SAMPLE_RATE });
			const from = Math.floor((element.trimStart / TICKS_PER_SECOND) * BEAT_SAMPLE_RATE);
			const part = samples.subarray(from, from + Math.ceil(seconds * BEAT_SAMPLE_RATE));
			const beats = detectBeats({ samples: part, sampleRate: BEAT_SAMPLE_RATE });
			const times = beats.map((t) => addMediaTime({ a: element.startTime, b: mediaTimeFromSeconds({ seconds: t }) }));
			for (const time of times) if (!editor.scenes.isBookmarked({ time })) await editor.scenes.toggleBookmark({ time });
			write({ beats: true, beatMarks: times.map((t) => Number(t)).join(",") });
			toast.success(beats.length ? `Marked ${beats.length} beats on the timeline` : "No clear beats in this clip");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Couldn't find the beats");
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="flex flex-col text-sm" data-audio-basic>
			<Section title="Volume">
				<ElementParamsTab element={element} trackId={trackId} paramKeys={["volume"]} sectionKey="audio-volume" />
			</Section>
			<Section
				title="Fade in and out"
				onReset={fadeIn || fadeOut ? () => write({ fadeIn: 0, fadeOut: 0 }) : undefined}
			>
				<FadeRow label="Fade-in duration" value={fadeIn} max={maxFade} onChange={(v) => write({ fadeIn: v })} testId="fade-in" />
				<FadeRow label="Fade-out duration" value={fadeOut} max={maxFade} onChange={(v) => write({ fadeOut: v })} testId="fade-out" />
			</Section>
			<ToggleRow
				title="Noise reduction"
				hint="Removes background hum and hiss; the original is kept."
				checked={!!element.voiceCleanup}
				busy={busy === "noise"}
				onChange={(on) => void toggleNoise(on)}
				testId="noise"
			/>
			<ToggleRow
				title="Beats detection"
				hint="Marks the beats on the timeline so cuts land on the music."
				checked={beatsOn}
				busy={busy === "beats"}
				onChange={(on) => void toggleBeats(on)}
				testId="beats"
			/>
			<button
				type="button"
				className="hover:bg-accent/50 flex items-center gap-3 border-b px-4 py-4 text-left"
				onClick={() => setEnhanceOpen((v) => !v)}
				aria-expanded={enhanceOpen}
				data-enhance-voice
			>
				<span className="flex-1">
					<span className="block font-semibold">Enhance voice</span>
					<span className="text-muted-foreground text-xs">
						Studio-quality voice in one click, trim silence and duck the music.
					</span>
				</span>
				<ChevronRight className={cn("size-4 transition-transform", enhanceOpen && "rotate-90")} />
			</button>
			{enhanceOpen && <VoiceTab element={element} trackId={trackId} />}
		</div>
	);
}

function Section({ title, onReset, children }: { title: string; onReset?: () => void; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-3 border-b px-4 py-4">
			<div className="flex items-center justify-between">
				<h3 className="m-0 font-semibold">{title}</h3>
				<button
					type="button"
					onClick={onReset}
					disabled={!onReset}
					className="text-muted-foreground hover:text-foreground disabled:opacity-40"
					aria-label={`Reset ${title.toLowerCase()}`}
				>
					<RotateCcw className="size-4" />
				</button>
			</div>
			{children}
		</section>
	);
}

function FadeRow({
	label,
	value,
	max,
	onChange,
	testId,
}: {
	label: string;
	value: number;
	max: number;
	onChange: (value: number) => void;
	testId: string;
}) {
	const shown = Math.min(value, max);
	return (
		<div className="flex flex-col gap-2" data-fade={testId}>
			<span className="text-muted-foreground text-xs">{label}</span>
			<div className="flex items-center gap-3">
				<Slider className="flex-1" min={0} max={max} step={0.1} value={[shown]} onValueChange={([v]) => onChange(v ?? 0)} />
				<label className="bg-accent/60 flex w-24 items-center rounded-md px-2.5 py-1.5">
					<input
						type="number"
						min={0}
						max={max}
						step={0.1}
						value={Math.round(shown * 10) / 10}
						onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
						className="w-full bg-transparent outline-none"
						aria-label={label}
					/>
					<span className="text-muted-foreground">s</span>
				</label>
			</div>
		</div>
	);
}

function ToggleRow({
	title,
	hint,
	checked,
	busy,
	onChange,
	testId,
}: {
	title: string;
	hint: string;
	checked: boolean;
	busy?: boolean;
	onChange: (on: boolean) => void;
	testId: string;
}) {
	return (
		<div className="flex items-center gap-3 border-b px-4 py-4" data-audio-toggle={testId}>
			<span className="flex-1">
				<span className="block font-semibold">{title}</span>
				<span className="text-muted-foreground text-xs">{busy ? "Working…" : hint}</span>
			</span>
			<Switch checked={checked} disabled={busy} onCheckedChange={onChange} aria-label={title} />
		</div>
	);
}
