import type { TextStyleOverrides } from "./element-style";
import type { TextAnimation } from "./types";

/**
 * Personal text animation presets (pure logic). The store lives in
 * preset-store.ts and syncs with the account settings.
 */
export interface TextAnimationPreset {
	id: string;
	name: string;
	animation: TextAnimation;
	/** Style params of the clip it was saved from (font, colours…). */
	params?: Record<string, unknown>;
	textStyle?: TextStyleOverrides;
	createdAt: number;
}

export const PRESET_STYLE_KEYS = [
	"fontFamily",
	"fontSize",
	"fontWeight",
	"fontStyle",
	"color",
	"textAlign",
	"letterSpacing",
	"lineHeight",
	"stroke.enabled",
	"stroke.color",
	"stroke.width",
	"shadow.enabled",
	"shadow.color",
	"shadow.blur",
	"shadow.offsetX",
	"shadow.offsetY",
	"glow.enabled",
	"glow.color",
	"glow.size",
	"background.enabled",
	"background.color",
];

/** The style params a preset keeps (never the words). */
export function presetStyleParams(params: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const key of PRESET_STYLE_KEYS) if (params[key] !== undefined) out[key] = params[key];
	return out;
}

export interface PresetTarget {
	trackId: string;
	elementId: string;
	params: Record<string, unknown>;
}

/**
 * Element patches applying a preset to many clips; pass them to one
 * `timeline.updateElements` call so it's a single undo step.
 */
export function presetPatches({
	preset,
	targets,
	withStyle = true,
}: {
	preset: Pick<TextAnimationPreset, "animation" | "params" | "textStyle">;
	targets: PresetTarget[];
	withStyle?: boolean;
}): Array<{ trackId: string; elementId: string; patch: { textAnimation: TextAnimation; params?: Record<string, unknown>; textStyle?: TextStyleOverrides } }> {
	return targets.map((t) => ({
		trackId: t.trackId,
		elementId: t.elementId,
		patch: {
			textAnimation: structuredClone(preset.animation),
			...(withStyle && preset.params ? { params: { ...t.params, ...preset.params } } : {}),
			...(withStyle && preset.textStyle ? { textStyle: { ...preset.textStyle } } : {}),
		},
	}));
}

/** Minimal editor surface used to apply presets (keeps this module testable). */
export interface PresetEditor {
	timeline: { updateElements: (args: { updates: ReturnType<typeof presetPatches> }) => void };
}

/** Applies a preset to every target in one undoable command. */
export function applyPresetToClips({ editor, preset, targets, withStyle }: { editor: PresetEditor; preset: Pick<TextAnimationPreset, "animation" | "params" | "textStyle">; targets: PresetTarget[]; withStyle?: boolean }) {
	if (targets.length === 0) return;
	editor.timeline.updateElements({ updates: presetPatches({ preset, targets, withStyle }) });
}

/** Patches that clear the animation (Reset), one undo step. */
export function resetPatches(targets: Array<{ trackId: string; elementId: string }>) {
	return targets.map((t) => ({ ...t, patch: { textAnimation: undefined } }));
}
