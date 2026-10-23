/**
 * Translation memory (SRS AI-37): when the user corrects a Gemini
 * translation, the source and the corrected wording are kept and sent as
 * examples with later translations into the same language, this project's
 * first.
 */
import type { Transcript } from "@/transcript/types";

export interface MemoryEntry {
	source: string;
	corrected: string;
	/** Language translated into. */
	target: string;
	projectId: string;
	at: number;
}

export const MEMORY_LIMIT = 500;
export const EXAMPLES_PER_REQUEST = 20;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Segments whose translation the user changed. */
export function correctionsIn({
	transcript,
	projectId,
	at = Date.now(),
}: {
	transcript: Transcript;
	projectId: string;
	at?: number;
}): MemoryEntry[] {
	const out: MemoryEntry[] = [];
	for (const segment of transcript.segments) {
		const t = segment.translation;
		if (!t) continue;
		const corrected = clean(segment.text);
		if (!corrected || corrected === clean(t.machine)) continue;
		out.push({ source: clean(t.source), corrected, target: t.target, projectId, at });
	}
	return out;
}

/** Adds entries, replacing older ones for the same source, newest first. */
export function mergeEntries({
	entries,
	added,
}: {
	entries: MemoryEntry[];
	added: MemoryEntry[];
}): MemoryEntry[] {
	if (!added.length) return entries;
	const key = (e: MemoryEntry) => `${e.projectId}\u0000${e.target}\u0000${e.source}`;
	const fresh = new Map(added.map((e) => [key(e), e]));
	const unchanged = added.every((e) => entries.some((old) => key(old) === key(e) && old.corrected === e.corrected));
	if (unchanged) return entries;
	return [...fresh.values(), ...entries.filter((e) => !fresh.has(key(e)))].slice(0, MEMORY_LIMIT);
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));

/** The examples to send: same language, this project first, then shared words, then newest. */
export function examplesFor({
	entries,
	target,
	projectId,
	texts,
	limit = EXAMPLES_PER_REQUEST,
}: {
	entries: MemoryEntry[];
	target: string;
	projectId: string | null;
	texts: string[];
	limit?: number;
}): { source: string; corrected: string }[] {
	const vocab = words(texts.join(" "));
	const score = (e: MemoryEntry) => {
		let shared = 0;
		for (const w of words(e.source)) if (vocab.has(w)) shared++;
		return (e.projectId === projectId ? 1000 : 0) + shared;
	};
	const seen = new Set<string>();
	return entries
		.filter((e) => e.target === target)
		.map((e, i) => ({ e, s: score(e), i }))
		.sort((a, b) => b.s - a.s || a.i - b.i)
		.filter(({ e }) => !seen.has(e.source) && !!seen.add(e.source))
		.slice(0, limit)
		.map(({ e }) => ({ source: e.source, corrected: e.corrected }));
}
