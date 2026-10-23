"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/ui";
import { installInputMethod, pickCandidate, useCandidates } from "../controller";

/** Installs the input method on the page and draws the candidate list. */
export function InputMethodHost() {
	useEffect(() => installInputMethod({ doc: document }), []);
	return <CandidateList />;
}

function CandidateList() {
	const { candidates, selected, anchor, latin, doc } = useCandidates();
	if (!anchor || candidates.length === 0 || !doc) return null;
	return createPortal(
		<div
			className="bg-popover text-popover-foreground fixed z-[1000] flex items-center gap-0.5 rounded-md border p-1 text-sm shadow-lg"
			style={{ left: anchor.left, top: anchor.top }}
			aria-label={`Suggestions for ${latin}`}
		>
			{candidates.map((word, index) => (
				<button
					key={word}
					type="button"
					aria-pressed={index === selected}
					onMouseDown={(event) => event.preventDefault()}
					className={cn(
						"flex items-baseline gap-1 rounded px-1.5 py-0.5 hover:bg-accent",
						index === selected && "bg-primary/15 text-primary",
					)}
					onClick={() => pickCandidate({ index })}
				>
					<span className="text-muted-foreground text-[10px]">{index + 1}</span>
					<span>{word}</span>
				</button>
			))}
		</div>,
		doc.body,
	);
}
