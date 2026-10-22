import type { Tab } from "@/components/editor/panels/assets/assets-panel-store";
import type { PanelSizes } from "@/editor/panel-store";

export interface WorkspaceLayout {
	panels: PanelSizes;
	/** Tool panel tab shown when the workspace opens. */
	tab: Tab;
}

export interface Workspace extends WorkspaceLayout {
	id: string;
	name: string;
	builtIn: boolean;
	description: string;
}

/**
 * Built-in workspaces (SRS WS-01). Each is a panel arrangement for one kind
 * of work; sizes are percentages of the editor (tools | preview | properties
 * across the top, main area over the timeline).
 */
export const BUILT_IN_WORKSPACES: Workspace[] = [
	{
		id: "edit",
		name: "Edit",
		builtIn: true,
		description:
			"Balanced layout for cutting: media, preview, properties and a full-width timeline.",
		tab: "media",
		panels: {
			tools: 25,
			preview: 50,
			properties: 25,
			mainContent: 55,
			timeline: 45,
		},
	},
	{
		id: "color",
		name: "Color",
		builtIn: true,
		description:
			"Large preview with adjustment controls and a compact timeline.",
		tab: "adjustment",
		panels: {
			tools: 24,
			preview: 52,
			properties: 24,
			mainContent: 72,
			timeline: 28,
		},
	},
	{
		id: "audio",
		name: "Audio",
		builtIn: true,
		description:
			"Tall timeline for waveforms, with sounds and audio properties beside the preview.",
		tab: "sounds",
		panels: {
			tools: 26,
			preview: 44,
			properties: 30,
			mainContent: 40,
			timeline: 60,
		},
	},
	{
		id: "captions",
		name: "Captions",
		builtIn: true,
		description:
			"Wide captions panel beside the preview for Sinhala and English subtitle work.",
		tab: "captions",
		panels: {
			tools: 33,
			preview: 42,
			properties: 25,
			mainContent: 62,
			timeline: 38,
		},
	},
	{
		id: "effects",
		name: "Effects",
		builtIn: true,
		description: "Effects browser and effect controls around a live preview.",
		tab: "effects",
		panels: {
			tools: 28,
			preview: 46,
			properties: 26,
			mainContent: 60,
			timeline: 40,
		},
	},
	{
		id: "text",
		name: "Text",
		builtIn: true,
		description:
			"Text styles beside the preview, with text properties on the right.",
		tab: "text",
		panels: {
			tools: 30,
			preview: 45,
			properties: 25,
			mainContent: 62,
			timeline: 38,
		},
	},
];

export const DEFAULT_WORKSPACE_ID = "edit";
