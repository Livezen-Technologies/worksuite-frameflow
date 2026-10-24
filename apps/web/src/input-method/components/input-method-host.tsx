"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/ui";
import { loadDictionary } from "../candidates";
import { installInputMethod, pickCandidate, useCandidates } from "../controller";
import { useInputMethod } from "../store";

/** Installs the input method on the page and draws the candidate list. */
export function InputMethodHost() {
	useEffect(() => installInputMethod({ doc: document }), []);
	// The full word lists load the first time their language is used (TI-10).
	const mode = useInputMethod((s) => s.mode);
	useEffect(() => {
		if (mode !== "en") void loadDictionary(mode);
	}, [mode]);
	return <CandidateList />;
}

function CandidateList() {
	const { candidates, selected, anchor, latin, doc } = useCandidates();
	const list = useRef<HTMLDivElement>(null);
	const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

	// Under the caret, flipped above it near the bottom, and kept on screen.
	useLayoutEffect(() => {
		const el = list.current;
		const view = doc?.defaultView;
		if (!anchor || !el || !view) return setPlace(null);
		const { width, height } = el.getBoundingClientRect();
		const left = Math.max(8, Math.min(anchor.left - 12, view.innerWidth - width - 8));
		const below = anchor.top + height <= view.innerHeight - 8;
		setPlace({ left, top: below ? anchor.top : Math.max(8, anchor.above - height) });
	}, [anchor, candidates, doc]);

	if (!anchor || candidates.length === 0 || !doc) return null;
	return createPortal(
		<div
			ref={list}
			role="listbox"
			aria-label={latin ? `Suggestions for ${latin}` : "Next word"}
			className="bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 fixed z-[1000] flex min-w-44 max-w-72 flex-col overflow-hidden rounded-lg border shadow-xl duration-100"
			style={{ left: place?.left ?? anchor.left, top: place?.top ?? anchor.top, visibility: place ? "visible" : "hidden" }}
			data-candidates
		>
			<div className="text-muted-foreground flex items-center justify-between gap-3 border-b px-2.5 py-1 text-[11px]">
				<span className="truncate font-mono">{latin || "Next word"}</span>
				<span>{selected + 1}/{candidates.length}</span>
			</div>
			<div className="flex flex-col p-1">
				{candidates.map((word, index) => (
					<button
						key={word}
						type="button"
						role="option"
						aria-selected={index === selected}
						onMouseDown={(event) => event.preventDefault()}
						onMouseEnter={() => useCandidates.setState({ selected: index })}
						className={cn(
							"flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
							index === selected ? "bg-primary text-primary-foreground" : "hover:bg-accent",
						)}
						onClick={() => pickCandidate({ index })}
					>
						<span
							className={cn(
								"flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-medium",
								index === selected ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
							)}
						>
							{index + 1}
						</span>
						<span className="truncate text-base leading-tight">{word}</span>
					</button>
				))}
			</div>
			<div className="text-muted-foreground border-t px-2.5 py-1 text-[10px]">
				↑↓ choose · Space or Enter pick · 1–{Math.min(9, candidates.length)} · Esc
			</div>
		</div>,
		doc.body,
	);
}
