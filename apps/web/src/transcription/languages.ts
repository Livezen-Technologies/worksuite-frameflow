export const LANGUAGES = [
	{ code: "en", name: "English" },
	{ code: "si", name: "Sinhala (සිංහල)" },
	{ code: "ta", name: "Tamil (தமிழ்)" },
	{ code: "es", name: "Spanish" },
	{ code: "it", name: "Italian" },
	{ code: "fr", name: "French" },
	{ code: "de", name: "German" },
	{ code: "pt", name: "Portuguese" },
	{ code: "ru", name: "Russian" },
	{ code: "ja", name: "Japanese" },
	{ code: "zh", name: "Chinese" },
] as const;

export type Language = (typeof LANGUAGES)[number];
export type LanguageCode = Language["code"];
