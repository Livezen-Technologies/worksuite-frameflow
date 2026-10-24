import type { ClipEq } from "@/timeline/audio-state";

/** EQ presets (Audio Studio › EQ & sound). */
export const EQ_PRESETS: { id: string; label: string; eq: ClipEq }[] = [
	{ id: "flat", label: "Flat", eq: { low: 0, mid: 0, high: 0, lowCut: 0 } },
	{ id: "podcast", label: "Podcast voice", eq: { low: -2, mid: 2, high: 3, lowCut: 80 } },
	{ id: "warm", label: "Warm", eq: { low: 4, mid: 0, high: -3, lowCut: 0 } },
	{ id: "bright", label: "Bright", eq: { low: 0, mid: 1, high: 6, lowCut: 0 } },
	{ id: "bass", label: "Bass boost", eq: { low: 8, mid: 0, high: 0, lowCut: 0 } },
	{ id: "radio", label: "Radio", eq: { low: -10, mid: 6, high: -8, lowCut: 250 } },
	{ id: "telephone", label: "Telephone", eq: { low: -18, mid: 4, high: -18, lowCut: 400 } },
	{ id: "deess", label: "Soft highs", eq: { low: 0, mid: 0, high: -5, lowCut: 0 } },
];
