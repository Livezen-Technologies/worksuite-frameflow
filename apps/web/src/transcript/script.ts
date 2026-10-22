import type { ScriptLanguage } from "./types";

const SINHALA = /[඀-෿]/u;
const SINHALA_ALL = /[඀-෿]/gu;
const LATIN_ALL = /[A-Za-zÀ-ɏ]/gu;

export function containsSinhala(text: string): boolean {
	return SINHALA.test(text);
}

/**
 * Tags text by script: Sinhala block U+0D80–U+0DFF vs Latin letters.
 * Brand names and technical terms in Latin inside Sinhala speech make a
 * segment "mixed".
 */
export function detectScriptLanguage(text: string): ScriptLanguage {
	const sinhala = text.match(SINHALA_ALL)?.length ?? 0;
	const latin = text.match(LATIN_ALL)?.length ?? 0;
	if (sinhala > 0 && latin > 0) return "mixed";
	if (sinhala > 0) return "si";
	if (latin > 0) return "en";
	return "other";
}

export const SCRIPT_LANGUAGE_LABELS: Record<ScriptLanguage, string> = {
	si: "සිං",
	en: "EN",
	mixed: "සිං+EN",
	other: "—",
};
