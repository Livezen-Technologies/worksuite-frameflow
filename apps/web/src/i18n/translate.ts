import type { LocaleCode } from "./locales";
import { si } from "./messages/si";
import { ta } from "./messages/ta";

/**
 * Interface text is written in English in the code and looked up here by
 * that English text (gettext style), so a missing translation shows the
 * English instead of a key. `{name}` placeholders are filled from `vars`.
 */
export const CATALOGS: Record<
	Exclude<LocaleCode, "en">,
	Record<string, string>
> = { si, ta };

export function translate({
	text,
	locale,
	vars,
}: {
	text: string;
	locale: LocaleCode;
	vars?: Record<string, string | number>;
}): string {
	const found = locale === "en" ? text : (CATALOGS[locale][text] ?? text);
	return vars
		? found.replace(/\{(\w+)\}/g, (m, k: string) =>
				k in vars ? String(vars[k]) : m,
			)
		: found;
}
