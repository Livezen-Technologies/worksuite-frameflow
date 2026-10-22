import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { usePanelStore } from "@/editor/panel-store";
import type { WorkspaceLayout } from "./presets";

/** The editor's layout right now: panel sizes plus the open tool tab. */
export function readCurrentLayout(): WorkspaceLayout {
	return {
		panels: { ...usePanelStore.getState().panels },
		tab: useAssetsPanelStore.getState().activeTab,
	};
}
