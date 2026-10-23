"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { useProjectTabs } from "../store";

/** "Reopen the projects from last time" on the Home screen (MP-09). */
export function RestoreSessionBanner() {
	const router = useRouter();
	const saved = useProjectTabs((s) => s.lastSession);
	const tabs = useProjectTabs((s) => s.tabs);
	const known = useEditor((e) => e.project.getSavedProjects());
	const loaded = useEditor((e) => e.project.getIsInitialized());
	const [hidden, setHidden] = useState(false);
	const existing = saved.filter((t) => known.some((p) => p.id === t.id));
	if (!loaded || hidden || tabs.length > 0 || existing.length === 0)
		return null;
	return (
		<div
			className="mx-6 mt-4 flex items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm"
			data-restore-session
		>
			<History className="size-4 text-sky-400" />
			<span className="min-w-0 flex-1 truncate">
				Reopen{" "}
				{existing.length === 1
					? "the project"
					: `the ${existing.length} projects`}{" "}
				from last time:{" "}
				<span className="text-muted-foreground">
					{existing.map((t) => t.name).join(", ")}
				</span>
			</span>
			<Button
				size="sm"
				onClick={() => {
					const store = useProjectTabs.getState();
					for (const tab of store
						.takeLastSession()
						.filter((t) => existing.some((e) => e.id === t.id))) {
						useProjectTabs.getState().open(tab);
					}
					const first = existing[0];
					if (first) router.push(`/editor/${first.id}`);
				}}
			>
				Reopen
			</Button>
			<button
				type="button"
				aria-label="Dismiss"
				className="text-muted-foreground hover:text-foreground"
				onClick={() => {
					useProjectTabs.getState().takeLastSession();
					setHidden(true);
				}}
			>
				<X className="size-4" />
			</button>
		</div>
	);
}
