/**
 * Interface languages (SRS 4.3, 14): English, Sinhala and Tamil, plus the
 * other 24 locales. `reviewed: false` marks a machine pre-translation that a
 * native speaker still has to check; the picker says so.
 */
export const LOCALES = [
	{
		code: "en",
		name: "English",
		native: "English",
		dir: "ltr",
		reviewed: true,
	},
	{ code: "si", name: "Sinhala", native: "සිංහල", dir: "ltr", reviewed: true },
	{ code: "ta", name: "Tamil", native: "தமிழ்", dir: "ltr", reviewed: true },
	{
		code: "ar",
		name: "Arabic",
		native: "العربية",
		dir: "rtl",
		reviewed: false,
	},
	{ code: "bn", name: "Bengali", native: "বাংলা", dir: "ltr", reviewed: false },
	{
		code: "de",
		name: "German",
		native: "Deutsch",
		dir: "ltr",
		reviewed: false,
	},
	{
		code: "es",
		name: "Spanish",
		native: "Español",
		dir: "ltr",
		reviewed: false,
	},
	{ code: "fa", name: "Persian", native: "فارسی", dir: "rtl", reviewed: false },
	{
		code: "fr",
		name: "French",
		native: "Français",
		dir: "ltr",
		reviewed: false,
	},
	{ code: "he", name: "Hebrew", native: "עברית", dir: "rtl", reviewed: false },
	{ code: "hi", name: "Hindi", native: "हिन्दी", dir: "ltr", reviewed: false },
	{
		code: "id",
		name: "Indonesian",
		native: "Bahasa Indonesia",
		dir: "ltr",
		reviewed: false,
	},
	{
		code: "it",
		name: "Italian",
		native: "Italiano",
		dir: "ltr",
		reviewed: false,
	},
	{
		code: "ja",
		name: "Japanese",
		native: "日本語",
		dir: "ltr",
		reviewed: false,
	},
	{ code: "ko", name: "Korean", native: "한국어", dir: "ltr", reviewed: false },
	{
		code: "ms",
		name: "Malay",
		native: "Bahasa Melayu",
		dir: "ltr",
		reviewed: false,
	},
	{
		code: "nl",
		name: "Dutch",
		native: "Nederlands",
		dir: "ltr",
		reviewed: false,
	},
	{ code: "pl", name: "Polish", native: "Polski", dir: "ltr", reviewed: false },
	{
		code: "pt",
		name: "Portuguese",
		native: "Português",
		dir: "ltr",
		reviewed: false,
	},
	{
		code: "ru",
		name: "Russian",
		native: "Русский",
		dir: "ltr",
		reviewed: false,
	},
	{
		code: "sv",
		name: "Swedish",
		native: "Svenska",
		dir: "ltr",
		reviewed: false,
	},
	{ code: "th", name: "Thai", native: "ไทย", dir: "ltr", reviewed: false },
	{
		code: "tr",
		name: "Turkish",
		native: "Türkçe",
		dir: "ltr",
		reviewed: false,
	},
	{
		code: "uk",
		name: "Ukrainian",
		native: "Українська",
		dir: "ltr",
		reviewed: false,
	},
	{ code: "ur", name: "Urdu", native: "اردو", dir: "rtl", reviewed: false },
	{
		code: "vi",
		name: "Vietnamese",
		native: "Tiếng Việt",
		dir: "ltr",
		reviewed: false,
	},
	{
		code: "zh",
		name: "Chinese (Simplified)",
		native: "简体中文",
		dir: "ltr",
		reviewed: false,
	},
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
