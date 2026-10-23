import type { TimelineElement } from "@/timeline";
import { TEMPLATE_STYLE_KEYS } from "@/text/templates";

/** What "Paste attributes" can copy from one clip onto others (MP-16). */
export type AttributeGroup =
	| "effects"
	| "grade"
	| "transform"
	| "speed"
	| "audio"
	| "textStyle"
	| "animations"
	| "keyframes";

export const ATTRIBUTE_GROUPS: { id: AttributeGroup; label: string }[] = [
	{ id: "effects", label: "Effects" },
	{ id: "grade", label: "Color grade and LUTs" },
	{ id: "transform", label: "Position, scale and rotation" },
	{ id: "speed", label: "Speed" },
	{ id: "audio", label: "Volume and mute" },
	{ id: "textStyle", label: "Text style" },
	{ id: "animations", label: "In / Out / Loop animations" },
	{ id: "keyframes", label: "Keyframes" },
];

const GRADE_TYPES = new Set(["color-grade", "lut"]);
type Effect = {
	id: string;
	type: string;
	params: Record<string, unknown>;
	enabled: boolean;
};

const effectsOf = (e: TimelineElement): Effect[] =>
	"effects" in e && Array.isArray(e.effects) ? e.effects : [];

/** The patch that copies the chosen groups from `source` onto `target`. */
export function attributePatch({
	source,
	target,
	groups,
	makeId,
}: {
	source: TimelineElement;
	target: TimelineElement;
	groups: Set<AttributeGroup>;
	makeId: () => string;
}): Partial<TimelineElement> {
	const params = { ...target.params };
	const pick = (match: (key: string) => boolean) => {
		for (const [key, value] of Object.entries(source.params))
			if (match(key)) params[key] = value;
	};
	if (groups.has("transform")) pick((k) => k.startsWith("transform."));
	if (groups.has("audio")) pick((k) => k === "volume" || k === "muted");
	if (
		groups.has("textStyle") &&
		source.type === "text" &&
		target.type === "text"
	) {
		const keys = new Set(TEMPLATE_STYLE_KEYS);
		pick((k) => keys.has(k));
	}
	if (groups.has("animations")) pick((k) => k.startsWith("animation."));

	const patch: Partial<TimelineElement> & Record<string, unknown> = { params };
	if ((groups.has("effects") || groups.has("grade")) && "effects" in target) {
		const fresh = (list: Effect[]) => list.map((e) => ({ ...e, id: makeId() }));
		const keepTarget = effectsOf(target).filter((e) =>
			GRADE_TYPES.has(e.type) ? !groups.has("grade") : !groups.has("effects"),
		);
		const fromSource = effectsOf(source).filter((e) =>
			GRADE_TYPES.has(e.type) ? groups.has("grade") : groups.has("effects"),
		);
		patch.effects = [
			...fresh(fromSource.filter((e) => GRADE_TYPES.has(e.type))),
			...keepTarget,
			...fresh(fromSource.filter((e) => !GRADE_TYPES.has(e.type))),
		];
	}
	if (groups.has("speed") && "retime" in source && "retime" in target)
		patch.retime = source.retime;
	if (groups.has("keyframes")) patch.animations = source.animations;
	return patch;
}
