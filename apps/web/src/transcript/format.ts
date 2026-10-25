import { parseSubtitleFile } from "@/subtitles/parse";
import { parseSrt } from "@/subtitles/srt";
import { createTranscript } from "./transcript";
import type { Transcript } from "./types";

function pad({ value, size = 2 }: { value: number; size?: number }): string {
	return String(value).padStart(size, "0");
}

export function formatTimestamp({
	seconds,
	separator,
}: {
	seconds: number;
	separator: "," | ".";
}): string {
	const totalMs = Math.max(0, Math.round(seconds * 1000));
	const hours = Math.floor(totalMs / 3_600_000);
	const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
	const secs = Math.floor((totalMs % 60_000) / 1000);
	const ms = totalMs % 1000;
	return `${pad({ value: hours })}:${pad({ value: minutes })}:${pad({ value: secs })}${separator}${pad({ value: ms, size: 3 })}`;
}

/** Short clock for the editor, e.g. 01:05.3 */
export function formatClock(seconds: number): string {
	const safe = Math.max(0, seconds);
	const minutes = Math.floor(safe / 60);
	const secs = safe - minutes * 60;
	return `${pad({ value: minutes })}:${secs.toFixed(1).padStart(4, "0")}`;
}

export function transcriptToSrt(transcript: Transcript): string {
	return transcript.segments
		.map(
			(segment, index) =>
				`${index + 1}\n${formatTimestamp({ seconds: segment.start, separator: "," })} --> ${formatTimestamp({ seconds: segment.end, separator: "," })}\n${segment.speaker ? `${segment.speaker}: ` : ""}${segment.text}\n`,
		)
		.join("\n");
}

export function transcriptToVtt(transcript: Transcript): string {
	const body = transcript.segments
		.map(
			(segment) =>
				`${formatTimestamp({ seconds: segment.start, separator: "." })} --> ${formatTimestamp({ seconds: segment.end, separator: "." })}\n${segment.speaker ? `<v ${segment.speaker.replace(/[<>&]/g, "")}>` : ""}${segment.text}\n`,
		)
		.join("\n");
	return `WEBVTT\n\n${body}`;
}

export function transcriptToTxt(transcript: Transcript): string {
	return `${transcript.segments.map((segment) => segment.text).join("\n")}\n`;
}

export function transcriptToJson(transcript: Transcript): string {
	return `${JSON.stringify(transcript, null, 2)}\n`;
}

export type TranscriptExportFormat = "srt" | "vtt" | "txt" | "json";

export function exportTranscript({
	transcript,
	format,
}: {
	transcript: Transcript;
	format: TranscriptExportFormat;
}): { content: string; mimeType: string } {
	switch (format) {
		case "srt":
			return {
				content: transcriptToSrt(transcript),
				mimeType: "application/x-subrip",
			};
		case "vtt":
			return { content: transcriptToVtt(transcript), mimeType: "text/vtt" };
		case "txt":
			return { content: transcriptToTxt(transcript), mimeType: "text/plain" };
		case "json":
			return {
				content: transcriptToJson(transcript),
				mimeType: "application/json",
			};
	}
}

function isTranscript(value: unknown): value is Transcript {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<Transcript>;
	return (
		candidate.version === 1 &&
		Array.isArray(candidate.segments) &&
		candidate.segments.every(
			(segment) =>
				typeof segment?.text === "string" &&
				typeof segment?.start === "number" &&
				typeof segment?.end === "number",
		)
	);
}

/**
 * Reads a transcript from SRT, VTT, ASS or our JSON. TXT has no timings,
 * so it can only replace the text of an existing transcript line by line.
 */
export function importTranscript({
	fileName,
	input,
	current,
}: {
	fileName: string;
	input: string;
	current: Transcript | null;
}): Transcript {
	const lower = fileName.toLowerCase();
	if (lower.endsWith(".json")) {
		const parsed: unknown = JSON.parse(input);
		if (!isTranscript(parsed))
			throw new Error("This JSON file isn't a FrameFlow transcript.");
		return createTranscript({
			segments: parsed.segments,
			language: parsed.language ?? "auto",
			engine: parsed.engine ?? "Imported",
		});
	}
	if (lower.endsWith(".txt")) {
		if (!current)
			throw new Error(
				"Import a TXT file onto an existing transcript; it has no timings.",
			);
		const lines = input
			.replace(/\r\n?/g, "\n")
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
		if (lines.length !== current.segments.length) {
			throw new Error(
				`The TXT file has ${lines.length} lines but the transcript has ${current.segments.length} segments. Keep one line per segment.`,
			);
		}
		return createTranscript({
			segments: current.segments.map((segment, index) => ({
				...segment,
				text: lines[index],
			})),
			language: current.language,
			engine: current.engine,
		});
	}
	const result = lower.endsWith(".vtt")
		? parseSrt({ input: vttToSrt(input) })
		: parseSubtitleFile({ fileName, input });
	if (result.captions.length === 0)
		throw new Error("No subtitle cues were found in this file.");
	return createTranscript({
		segments: result.captions.map((cue) => ({
			text: cue.text,
			start: cue.startTime,
			end: cue.startTime + cue.duration,
		})),
		language: "auto",
		engine: "Imported",
	});
}

/** WebVTT is close enough to SRT once its header, notes and cue settings go. */
function vttToSrt(input: string): string {
	const withHours = (stamp: string) =>
		stamp.split(":").length === 2 ? `00:${stamp}` : stamp;
	return input
		.replace(/\r\n?/g, "\n")
		.split(/\n{2,}/)
		.filter((block) => !/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(block.trim()))
		.map((block) =>
			block.replace(
				/^((?:\d{2}:)?\d{2}:\d{2}\.\d{1,3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{1,3}).*$/m,
				(_line, start: string, end: string) =>
					`${withHours(start)} --> ${withHours(end)}`,
			),
		)
		.join("\n\n");
}
