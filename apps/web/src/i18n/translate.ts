import type { LocaleCode } from "./locales";
import { si } from "./messages/si";
import { ta } from "./messages/ta";
import { assetLibrarySi } from "./messages/asset-library-si";
import { assetLibraryTa } from "./messages/asset-library-ta";
import { ar } from "./messages/ar";
import { bn } from "./messages/bn";
import { de } from "./messages/de";
import { es } from "./messages/es";
import { fa } from "./messages/fa";
import { fr } from "./messages/fr";
import { he } from "./messages/he";
import { hi } from "./messages/hi";
import { id } from "./messages/id";
import { it } from "./messages/it";
import { ja } from "./messages/ja";
import { ko } from "./messages/ko";
import { ms } from "./messages/ms";
import { nl } from "./messages/nl";
import { pl } from "./messages/pl";
import { pt } from "./messages/pt";
import { ru } from "./messages/ru";
import { sv } from "./messages/sv";
import { th } from "./messages/th";
import { tr } from "./messages/tr";
import { uk } from "./messages/uk";
import { ur } from "./messages/ur";
import { vi } from "./messages/vi";
import { zh } from "./messages/zh";

/**
 * Interface text is written in English in the code and looked up here by
 * that English text (gettext style), so a missing translation shows the
 * English instead of a key. `{name}` placeholders are filled from `vars`.
 */
export const CATALOGS: Record<
	Exclude<LocaleCode, "en">,
	Record<string, string>
> = {
	// The Asset Library strings are Sinhala and Tamil only (other locales show English).
	si: { ...assetLibrarySi, ...si },
	ta: { ...assetLibraryTa, ...ta },
	ar,
	bn,
	de,
	es,
	fa,
	fr,
	he,
	hi,
	id,
	it,
	ja,
	ko,
	ms,
	nl,
	pl,
	pt,
	ru,
	sv,
	th,
	tr,
	uk,
	ur,
	vi,
	zh,
};

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
