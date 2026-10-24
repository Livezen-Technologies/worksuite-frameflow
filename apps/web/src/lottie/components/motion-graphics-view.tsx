"use client";

import Link from "next/link";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { AnimationsView } from "./animations-view";

/** Motion graphics tab: the animation library, your imported and saved animations, and Lottie import. */
export function MotionGraphicsView() {
	return (
		<PanelView title="Motion graphics">
			<div className="flex h-full min-h-0 flex-col gap-2" data-motion-view>
				<Link href="/motion" target="_blank" className="text-primary border px-2 py-1 text-center text-xs" data-open-motion-studio>
					Open Motion Studio
				</Link>
				<AnimationsView />
			</div>
		</PanelView>
	);
}
