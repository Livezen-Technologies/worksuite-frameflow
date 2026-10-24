import type { ImportedAnimation } from "./import";

/**
 * Asks which animations of a multi-animation .lottie to import. Blank or
 * "all" imports every one; cancelling imports none.
 */
export async function pickDotLottieAnimations(choices: ImportedAnimation[]): Promise<ImportedAnimation[]> {
	if (typeof window === "undefined" || choices.length <= 1) return choices;
	const list = choices.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
	const answer = window.prompt(`This .lottie has ${choices.length} animations:\n${list}\n\nWhich to import? (e.g. 1,3 — blank for all)`, "");
	if (answer === null) return [];
	return parsePick(answer, choices);
}

export function parsePick<T>(answer: string, choices: T[]): T[] {
	const text = answer.trim().toLowerCase();
	if (!text || text === "all") return choices;
	const picked = new Set<number>();
	for (const part of text.split(/[\s,]+/)) {
		const range = /^(\d+)-(\d+)$/.exec(part);
		if (range) for (let i = Number(range[1]); i <= Number(range[2]); i++) picked.add(i - 1);
		else if (/^\d+$/.test(part)) picked.add(Number(part) - 1);
	}
	return [...picked].filter((i) => i >= 0 && i < choices.length).sort((a, b) => a - b).map((i) => choices[i]!);
}
