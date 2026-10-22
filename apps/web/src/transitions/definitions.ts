import type { TransitionCategory, TransitionType } from "./types";

export interface TransitionDefinition {
	type: TransitionType;
	name: string;
	category: TransitionCategory;
	keywords: string[];
	/** Whether Direction changes it. */
	directional: boolean;
}

export const TRANSITIONS: TransitionDefinition[] = [
	{
		type: "cross-dissolve",
		name: "Cross dissolve",
		category: "Basic",
		keywords: ["fade", "mix"],
		directional: false,
	},
	{
		type: "dip-to-black",
		name: "Dip to black",
		category: "Basic",
		keywords: ["fade", "black"],
		directional: false,
	},
	{
		type: "blur-dissolve",
		name: "Blur dissolve",
		category: "Basic",
		keywords: ["blur", "soft"],
		directional: false,
	},
	{
		type: "slide",
		name: "Slide",
		category: "Slide",
		keywords: ["cover", "over"],
		directional: true,
	},
	{
		type: "push",
		name: "Push",
		category: "Slide",
		keywords: ["move"],
		directional: true,
	},
	{
		type: "wipe",
		name: "Wipe",
		category: "Wipe",
		keywords: ["reveal", "line"],
		directional: true,
	},
	{
		type: "split",
		name: "Split",
		category: "Wipe",
		keywords: ["barn door", "open"],
		directional: true,
	},
	{
		type: "circle",
		name: "Circle reveal",
		category: "Shape",
		keywords: ["iris", "round"],
		directional: false,
	},
	{
		type: "iris-diamond",
		name: "Iris diamond",
		category: "Shape",
		keywords: ["diamond", "shape"],
		directional: false,
	},
	{
		type: "zoom-in",
		name: "Zoom in",
		category: "Zoom",
		keywords: ["scale", "punch"],
		directional: false,
	},
	{
		type: "zoom-out",
		name: "Zoom out",
		category: "Zoom",
		keywords: ["scale", "pull"],
		directional: false,
	},
	{
		type: "spin",
		name: "Spin",
		category: "Motion",
		keywords: ["rotate", "turn"],
		directional: false,
	},
	{
		type: "whip-pan",
		name: "Whip pan",
		category: "Motion",
		keywords: ["fast", "motion blur"],
		directional: true,
	},
];

export const TRANSITION_CATEGORIES: TransitionCategory[] = [
	"Basic",
	"Slide",
	"Wipe",
	"Shape",
	"Zoom",
	"Motion",
];

export function getTransitionDefinition(
	type: TransitionType,
): TransitionDefinition {
	return TRANSITIONS.find((t) => t.type === type) ?? TRANSITIONS[0];
}
