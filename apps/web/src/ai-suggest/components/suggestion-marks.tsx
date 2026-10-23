"use client";

import { useMemo } from "react";
import { useEditor } from "@/editor/use-editor";
import { getTimelinePixelsPerSecond } from "@/timeline/pixel-utils";
import { type Suggestion, useSuggestions } from "../store";

const EMPTY: Suggestion[] = [];

/** Pending AI suggestions as dashed spans on the timeline (SRS AI-52). */
export function SuggestionMarks({ zoomLevel }: { zoomLevel: number }) {
	const projectId = useEditor((e) => e.project.getActiveOrNull()?.metadata.id ?? "");
	const all = useSuggestions((s) => s.byProject[projectId] ?? EMPTY);
	const pending = useMemo(() => all.filter((s) => s.status === "pending"), [all]);
	const pps = getTimelinePixelsPerSecond({ zoomLevel });
	return (
		<>
			{pending.map((s) => (
				<span
					key={s.id}
					className="pointer-events-none absolute top-0.5 bottom-0.5 rounded-sm border border-dashed border-amber-500/80 bg-amber-500/10 text-[9px] leading-none text-amber-300"
					style={{ left: s.start * pps, width: Math.max(4, (s.end - s.start) * pps) }}
					title={`${s.kind === "clip" ? s.title ?? "Clip" : "Reframe"} · ${Math.round(s.confidence * 100)}%`}
					data-suggestion-mark={s.kind}
				>
					<span className="ml-0.5">{Math.round(s.confidence * 100)}%</span>
				</span>
			))}
		</>
	);
}
