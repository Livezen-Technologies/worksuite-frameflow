"use client";

import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { AnimationsView } from "./animations-view";

/** Motion graphics tab: the animation library, your imported and saved animations, and Lottie import. */
export function MotionGraphicsView() {
	return (
		<PanelView title="Motion graphics">
			<div className="h-full min-h-0" data-motion-view>
				<AnimationsView />
			</div>
		</PanelView>
	);
}
