"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/utils/ui";
import {
	TAB_KEYS,
	tabs,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { useT } from "@/i18n";

export function TabBar() {
	const t = useT();
	const { activeTab, setActiveTab } = useAssetsPanelStore();
	const [showTopFade, setShowTopFade] = useState(false);
	const [showBottomFade, setShowBottomFade] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	const checkScrollPosition = useCallback(() => {
		const element = scrollRef.current;
		if (!element) return;

		const { scrollTop, scrollHeight, clientHeight } = element;
		setShowTopFade(scrollTop > 0);
		setShowBottomFade(scrollTop < scrollHeight - clientHeight - 1);
	}, []);

	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;

		checkScrollPosition();
		element.addEventListener("scroll", checkScrollPosition);

		const resizeObserver = new ResizeObserver(checkScrollPosition);
		resizeObserver.observe(element);

		return () => {
			element.removeEventListener("scroll", checkScrollPosition);
			resizeObserver.disconnect();
		};
	}, [checkScrollPosition]);

	return (
		<div className="relative flex">
			<div
				ref={scrollRef}
				className="scrollbar-hidden relative flex size-full flex-col items-center justify-start gap-1 overflow-y-auto px-1 py-1.5"
			>
				{TAB_KEYS.map((tabKey) => {
					const tab = tabs[tabKey];
					const active = activeTab === tabKey;
					return (
						<div key={tabKey} className="contents">
							{tabKey === "settings" && (
								<div className="bg-border my-1.5 h-px w-8 shrink-0" />
							)}
							<button
								type="button"
								aria-label={t(tab.label)}
								aria-pressed={active}
								onClick={() => setActiveTab(tabKey)}
								className={cn(
									"group flex w-[4.25rem] shrink-0 flex-col items-center gap-1 rounded-xl px-0.5 py-2 transition-colors",
									active
										? "bg-linear-to-b from-[#1f2a44] to-[#162036] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
										: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
								)}
							>
								<tab.icon className="size-5" />
								<span className="w-full truncate text-center text-[10px] leading-tight">
									{t(tab.label)}
								</span>
							</button>
						</div>
					);
				})}
			</div>

			<FadeOverlay direction="top" show={showTopFade} />
			<FadeOverlay direction="bottom" show={showBottomFade} />
		</div>
	);
}

function FadeOverlay({
	direction,
	show,
}: {
	direction: "top" | "bottom";
	show: boolean;
}) {
	return (
		<div
			className={cn(
				"pointer-events-none absolute right-0 left-0 h-6",
				direction === "top" && show
					? "from-background top-0 bg-linear-to-b to-transparent"
					: "from-background bottom-0 bg-linear-to-t to-transparent",
			)}
		/>
	);
}
