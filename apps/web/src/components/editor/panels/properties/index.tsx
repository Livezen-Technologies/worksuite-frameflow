"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { usePropertiesStore } from "./stores/properties-store";
import { getPropertiesConfig } from "./registry";
import { cn } from "@/utils/ui";
import { EmptyView } from "./empty-view";

export function PropertiesPanel() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	useEditor((e) => e.media.getAssets());
	const { selectedElements } = useElementSelection();
	const { activeTabPerType, setActiveTab } = usePropertiesStore();

	if (selectedElements.length === 0) {
		return (
			<div className="panel bg-background flex h-full flex-col items-center justify-center overflow-hidden rounded-sm border">
				<EmptyView />
			</div>
		);
	}

	if (selectedElements.length > 1) {
		return (
			<div className="panel bg-background flex h-full flex-col items-center justify-center overflow-hidden rounded-sm border">
				<p className="text-muted-foreground text-sm">
					{selectedElements.length} elements selected.0
				</p>
			</div>
		);
	}

	const mediaAssets = editor.media.getAssets();

	const elementsWithTracks = editor.timeline.getElementsWithTracks({
		elements: selectedElements,
	});
	const elementWithTrack = elementsWithTracks[0];

	if (!elementWithTrack) return null;

	const { element, track } = elementWithTrack;
	const config = getPropertiesConfig({ element, mediaAssets });
	const visibleTabs = config.tabs;

	const storedTabId = activeTabPerType[element.type];
	const isStoredTabVisible = visibleTabs.some((t) => t.id === storedTabId);
	const activeTabId = isStoredTabVisible ? storedTabId : config.defaultTab;
	const activeTab =
		visibleTabs.find((t) => t.id === activeTabId) ?? visibleTabs[0];

	if (!activeTab) return null;

	return (
		<div className="panel bg-background flex h-full overflow-hidden rounded-sm border">
			<div className="scrollbar-hidden order-last flex shrink-0 flex-col items-center gap-1 overflow-y-auto border-l px-1 py-1.5">
				{visibleTabs.map((tab) => {
					const active = tab.id === activeTab.id;
					return (
						<button
							key={tab.id}
							type="button"
							aria-label={tab.label}
							aria-pressed={active}
							onClick={() =>
								setActiveTab({ elementType: element.type, tabId: tab.id })
							}
							className={cn(
								"flex w-[4.25rem] shrink-0 flex-col items-center gap-1 rounded-xl px-0.5 py-2 transition-colors [&_svg]:size-[18px]",
								active
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
							)}
						>
							{tab.icon}
							<span className="w-full truncate text-center text-[10px] leading-tight">
								{tab.label}
							</span>
						</button>
					);
				})}
			</div>
			<ScrollArea className="flex-1 scrollbar-hidden">
				{activeTab.content({ trackId: track.id })}
			</ScrollArea>
		</div>
	);
}
