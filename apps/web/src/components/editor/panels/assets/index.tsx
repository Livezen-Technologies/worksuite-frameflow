"use client";

import { Separator } from "@/components/ui/separator";
import {
	type Tab,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { TabBar } from "./tabbar";
import { Captions } from "@/subtitles/components/assets-view";
import { ColorPanel } from "@/color/components/color-panel";
import { TransitionsView } from "@/transitions/components/transitions-view";
import { MediaView } from "./views/assets";
import { RecordView } from "@/recording/components/record-view";
import { TranscriptSidebar } from "@/transcript/components/transcript-sidebar";
import { BrandKitView } from "@/brand/components/brand-kit-view";
import { FiltersView } from "@/filters/components/filters-view";
import { TemplatesView } from "@/templates/components/templates-view";
import { SettingsView } from "./views/settings";
import { SoundsView } from "@/sounds/components/assets-view";
import { ElementsView } from "@/elements/components/elements-view";
import { TextView } from "@/text/components/assets-view";
import { MotionGraphicsView } from "@/lottie/components/motion-graphics-view";
import { EffectsView } from "@/effects/components/assets-view";

export function AssetsPanel() {
	const { activeTab } = useAssetsPanelStore();

	const viewMap: Record<Tab, React.ReactNode> = {
		media: <MediaView />,
		templates: <TemplatesView />,
		sounds: <SoundsView />,
		text: <TextView />,
		stickers: <ElementsView />,
		motion: <MotionGraphicsView />,
		effects: <EffectsView />,
		transitions: <TransitionsView />,
		filters: <FiltersView />,
		captions: <Captions />,
		transcript: <TranscriptSidebar />,
		record: <RecordView />,
		brand: <BrandKitView />,
		adjustment: <ColorPanel />,
		settings: <SettingsView />,
	};

	return (
		<div className="panel bg-background flex h-full rounded-sm border overflow-hidden">
			<TabBar />
			<Separator orientation="vertical" />
			<div className="flex-1 overflow-hidden">{viewMap[activeTab]}</div>
		</div>
	);
}
