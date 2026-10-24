import { getPersistedKeybindingsState } from "../persisted-state";

/** New default shortcuts (markers, mute/hide, ripple, timeline zoom, shortcut list), each only where the key is still free. */
const ADDED: Record<string, string> = {
	m: "toggle-bookmark",
	"shift+m": "toggle-elements-muted-selected",
	"shift+h": "toggle-elements-visibility-selected",
	"shift+r": "toggle-ripple-editing",
	"=": "timeline-zoom-in",
	"ctrl+=": "timeline-zoom-in",
	"-": "timeline-zoom-out",
	"ctrl+-": "timeline-zoom-out",
	"shift+z": "timeline-zoom-fit",
	"ctrl+/": "open-shortcuts",
};

export function v8ToV9({ state }: { state: unknown }): unknown {
	const v8 = getPersistedKeybindingsState({ state });
	if (!v8) return state;
	const bound = new Set(Object.values(v8.keybindings));
	const keybindings = { ...v8.keybindings };
	for (const [key, action] of Object.entries(ADDED)) if (!keybindings[key] && !bound.has(action)) keybindings[key] = action;
	return { ...v8, keybindings };
}
