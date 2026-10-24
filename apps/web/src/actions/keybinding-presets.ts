import type { ShortcutKey } from "./keybinding";
import { getDefaultShortcuts } from "./definitions";
import type { TActionWithOptionalArgs } from "./types";

type Overrides = ReadonlyArray<readonly [TActionWithOptionalArgs, readonly ShortcutKey[]]>;

/**
 * Shortcut sets that feel like other editors. Each starts from FrameFlow's
 * defaults and moves a few actions to the keys those editors use.
 */
export const KEYBINDING_PRESETS: ReadonlyArray<{ id: string; name: string; overrides: Overrides }> = [
	{ id: "frameflow", name: "FrameFlow (default)", overrides: [] },
	{
		id: "premiere",
		name: "Premiere Pro style",
		overrides: [
			["split", ["ctrl+k"]],
			["toggle-snapping", ["s"]],
			["timeline-zoom-in", ["="]],
			["timeline-zoom-out", ["-"]],
			["toggle-bookmark", ["m"]],
		],
	},
	{
		id: "finalcut",
		name: "Final Cut Pro style",
		overrides: [
			["split", ["ctrl+b"]],
			["timeline-zoom-in", ["ctrl+="]],
			["timeline-zoom-out", ["ctrl+-"]],
			["timeline-zoom-fit", ["shift+z"]],
			["toggle-bookmark", ["m"]],
			["toggle-snapping", ["n"]],
		],
	},
	{
		id: "capcut",
		name: "CapCut style",
		overrides: [
			["split", ["ctrl+b"]],
			["timeline-zoom-in", ["ctrl+="]],
			["timeline-zoom-out", ["ctrl+-"]],
			["toggle-bookmark", ["m"]],
		],
	},
];

export function presetKeybindings({ id }: { id: string }): Map<ShortcutKey, TActionWithOptionalArgs> {
	const map = getDefaultShortcuts();
	const preset = KEYBINDING_PRESETS.find((p) => p.id === id);
	for (const [action, keys] of preset?.overrides ?? []) {
		for (const [key, bound] of [...map]) if (bound === action || keys.includes(key)) map.delete(key);
		for (const key of keys) map.set(key, action);
	}
	return map;
}
