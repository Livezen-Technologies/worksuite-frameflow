export interface CaptionCue {
	start: number;
	end: number;
	text: string;
}

function stamp({ seconds, separator }: { seconds: number; separator: string }) {
	const ms = Math.max(0, Math.round(seconds * 1000));
	const pad = (n: number) => String(n).padStart(2, "0");
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	const s = Math.floor((ms % 60_000) / 1000);
	return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${String(ms % 1000).padStart(3, "0")}`;
}

export function cuesToSrt(cues: CaptionCue[]): string {
	return cues
		.map(
			(cue, i) =>
				`${i + 1}\n${stamp({ seconds: cue.start, separator: "," })} --> ${stamp({ seconds: cue.end, separator: "," })}\n${cue.text}\n`,
		)
		.join("\n");
}

export function cuesToVtt(cues: CaptionCue[]): string {
	const body = cues
		.map(
			(cue) =>
				`${stamp({ seconds: cue.start, separator: "." })} --> ${stamp({ seconds: cue.end, separator: "." })}\n${cue.text}\n`,
		)
		.join("\n");
	return `WEBVTT\n\n${body}`;
}
