import { getPersistedKeybindingsState } from "../persisted-state";

/** Adds the Copy frame shortcut (MP-19) unless the key is already taken. */
export function v7ToV8({ state }: { state: unknown }): unknown {
	const v7 = getPersistedKeybindingsState({ state });
	if (!v7) return state;
	if (v7.keybindings["ctrl+shift+c"]) return state;
	return {
		...v7,
		keybindings: { ...v7.keybindings, "ctrl+shift+c": "copy-frame" },
	};
}
