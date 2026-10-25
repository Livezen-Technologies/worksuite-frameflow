"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TRANSCRIPTION_MODELS } from "@/transcription/models";
import { MAX_CHUNK_SECONDS, MIN_CHUNK_SECONDS, useTranscriptionSettings } from "@/transcription/settings-store";

/** Piece length, model and mixed-language mode for local Whisper. */
export function TranscriptionSettings() {
	const { chunkSeconds, modelId, mixedSinhalaEnglish, set } = useTranscriptionSettings();
	const general = TRANSCRIPTION_MODELS.filter((m) => !m.language);
	return (
		<section className="flex flex-col gap-3" data-transcription-settings>
			<h2 className="m-0 text-sm font-semibold">Settings</h2>
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center justify-between text-xs">
					<span className="text-muted-foreground">Piece length</span>
					<span className="tabular-nums">{chunkSeconds} s</span>
				</div>
				<Slider
					min={MIN_CHUNK_SECONDS}
					max={MAX_CHUNK_SECONDS}
					step={1}
					value={[chunkSeconds]}
					onValueChange={([v]) => set({ chunkSeconds: v })}
					aria-label="Piece length in seconds"
				/>
				<p className="text-muted-foreground m-0 text-[11px] leading-snug">
					Audio is cut at pauses into pieces about this long. Shorter pieces give tighter timings.
				</p>
			</div>
			<div className="flex flex-col gap-1.5">
				<span className="text-muted-foreground text-xs">Model</span>
				<Select value={modelId} onValueChange={(v) => {
					const model = general.find((m) => m.id === v);
					if (model) set({ modelId: model.id });
				}}>
					<SelectTrigger data-transcription-model>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{general.map((m) => (
							<SelectItem key={m.id} value={m.id}>
								{m.name} · {m.description}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-muted-foreground m-0 text-[11px] leading-snug">Sinhala always uses the Sinhala model.</p>
			</div>
			<div className="flex items-start justify-between gap-3 text-xs">
				<span className="flex flex-col gap-0.5">
					<label htmlFor="transcription-mixed">Mixed Sinhala and English</label>
					<span className="text-muted-foreground text-[11px] leading-snug">
						Pieces the Sinhala model is unsure of are checked again in English, and the better result is kept.
					</span>
				</span>
				<Switch id="transcription-mixed" checked={mixedSinhalaEnglish} onCheckedChange={(v) => set({ mixedSinhalaEnglish: v })} />
			</div>
		</section>
	);
}
