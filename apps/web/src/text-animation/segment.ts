import type { TextUnit } from "./types";

/**
 * Segmentation for animation units. Graphemes come from Intl.Segmenter,
 * then Sinhala/Tamil conjuncts that Unicode still splits (virama + ZWJ +
 * consonant: yansaya, rakaransaya, touching letters; Tamil க்ஷ and ஸ்ரீ)
 * are merged so a unit is always something a font draws as one shape.
 */

const ZWJ = "‍";
const SINHALA_VIRAMA = "්";
const TAMIL_PULLI = "்";

let graphemeSegmenter: Intl.Segmenter | null = null;
let wordSegmenter: Intl.Segmenter | null = null;

function rawGraphemes(text: string): string[] {
	graphemeSegmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
	return Array.from(graphemeSegmenter.segment(text), (s) => s.segment);
}

function joinsNext(cluster: string, next: string): boolean {
	if (cluster.endsWith(ZWJ)) return true;
	if (next.startsWith(ZWJ)) return true;
	if (cluster.endsWith(SINHALA_VIRAMA + ZWJ)) return true;
	if (cluster.endsWith(TAMIL_PULLI)) {
		// க் + ஷ → க்ஷ ; ஸ் + ரீ → ஸ்ரீ
		if (cluster.startsWith("க") && next.startsWith("ஷ")) return true;
		if (cluster.startsWith("ஸ") && next.startsWith("ரீ")) return true;
	}
	return false;
}

/** Grapheme clusters, never splitting a Sinhala or Tamil conjunct. */
export function graphemes(text: string): string[] {
	const raw = rawGraphemes(text);
	const out: string[] = [];
	for (const g of raw) {
		const last = out[out.length - 1];
		if (last !== undefined && joinsNext(last, g)) out[out.length - 1] = last + g;
		else out.push(g);
	}
	return out;
}

export interface Segment {
	text: string;
	/** UTF-16 offset in the source line. */
	start: number;
	/** Whitespace isn't animated, but keeps its room. */
	space: boolean;
}

/** Words and the whitespace between them, in order, covering the whole text. */
export function wordSegments(text: string): Segment[] {
	wordSegmenter ??= new Intl.Segmenter(undefined, { granularity: "word" });
	const out: Segment[] = [];
	for (const s of wordSegmenter.segment(text)) {
		const space = /^\s+$/u.test(s.segment);
		const last = out[out.length - 1];
		// Punctuation sticks to the word before it ("hello," is one unit).
		if (!space && last && !last.space && !s.isWordLike) {
			last.text += s.segment;
			continue;
		}
		// Glue word pieces Intl splits inside one run of letters (e.g. a ZWJ conjunct).
		if (!space && last && !last.space && s.isWordLike && last.start + last.text.length === s.index && joinsNext(last.text, s.segment)) {
			last.text += s.segment;
			continue;
		}
		out.push({ text: s.segment, start: s.index, space });
	}
	return out;
}

export function graphemeSegments(text: string): Segment[] {
	let offset = 0;
	return graphemes(text).map((g) => {
		const seg = { text: g, start: offset, space: /^\s+$/u.test(g) };
		offset += g.length;
		return seg;
	});
}

/**
 * Splits text into lines: hard breaks at "\n", soft wraps between words
 * when `measure(line)` exceeds `maxWidth`. A word longer than the width
 * breaks between grapheme clusters, never inside one.
 */
export function breakLines(text: string, measure?: (s: string) => number, maxWidth?: number): string[] {
	const hard = text.replace(/\r\n?/g, "\n").split("\n");
	if (!measure || !maxWidth || maxWidth <= 0) return hard;
	const out: string[] = [];
	for (const paragraph of hard) {
		let line = "";
		for (const seg of wordSegments(paragraph)) {
			const candidate = line + seg.text;
			if (!line || measure(candidate.trimEnd()) <= maxWidth) {
				line = candidate;
				if (!seg.space && measure(line.trimEnd()) > maxWidth && line === seg.text) {
					// A single word wider than the line: break between clusters.
					let piece = "";
					for (const g of graphemes(seg.text)) {
						if (piece && measure(piece + g) > maxWidth) {
							out.push(piece);
							piece = g;
						} else piece += g;
					}
					line = piece;
				}
				continue;
			}
			if (seg.space) {
				line = candidate;
				continue;
			}
			out.push(line.trimEnd());
			line = seg.text;
		}
		out.push(line.trimEnd());
	}
	return out;
}

/** The animated units of each line (whitespace segments are kept but flagged). */
export function unitSegments(line: string, unit: TextUnit): Segment[] {
	if (unit === "grapheme") return graphemeSegments(line);
	if (unit === "word") return wordSegments(line);
	return line ? [{ text: line, start: 0, space: false }] : [];
}

/** Units in a whole text (for counting and caption timing). */
export function countUnits(text: string, unit: TextUnit): number {
	if (unit === "block") return text.trim() ? 1 : 0;
	return breakLines(text).reduce((n, line) => n + unitSegments(line, unit).filter((s) => !s.space).length, 0);
}

export type Script = "sinhala" | "tamil" | "latin" | "other";

export function dominantScript(text: string): Script {
	let si = 0;
	let ta = 0;
	let la = 0;
	for (const ch of text) {
		const c = ch.codePointAt(0) ?? 0;
		if (c >= 0x0d80 && c <= 0x0dff) si++;
		else if (c >= 0x0b80 && c <= 0x0bff) ta++;
		else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0xc0 && c <= 0x24f)) la++;
	}
	if (si === 0 && ta === 0 && la === 0) return "other";
	if (si >= ta && si >= la) return "sinhala";
	if (ta >= la) return "tamil";
	return "latin";
}

/** True when the text needs complex shaping (Sinhala, Tamil, or anything non-Latin). */
export function needsShaping(text: string): boolean {
	return /[ऀ-෿฀-࿿က-႟؀-ۿ]/u.test(text);
}
