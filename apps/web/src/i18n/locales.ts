/** Interface languages (SRS 4.3, 14): English plus Sinhala and Tamil. */
export const LOCALES = [
	{ code: "en", name: "English", native: "English", dir: "ltr" },
	{ code: "si", name: "Sinhala", native: "සිංහල", dir: "ltr" },
	{ code: "ta", name: "Tamil", native: "தமிழ்", dir: "ltr" },
] as const;

export type LocaleCode = (typeof LOCALES)[number]["code"];

export function isLocale(code: string): code is LocaleCode {
	return LOCALES.some((l) => l.code === code);
}

export function localeInfo(code: LocaleCode) {
	return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

/** The system language if we have it, else English. */
export function detectLocale(languages: readonly string[]): LocaleCode {
	for (const tag of languages) {
		const base = tag.toLowerCase().split("-")[0];
		if (isLocale(base)) return base;
	}
	return "en";
}
