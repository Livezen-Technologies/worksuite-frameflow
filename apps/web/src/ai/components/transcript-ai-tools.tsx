"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LANGUAGES } from "@/transcription/languages";
import type { Transcript } from "@/transcript/types";
import { aiBridge } from "../bridge";
import { EditorCore } from "@/core";
import { aiCleanUp, aiTranslate, cancelAi, estimateTextJob } from "../tasks";
import { AiCostNote } from "./ai-spending";

/** Transcript editor: translate and clean up with Gemini, with undo. */
export function TranscriptAiTools({
	transcript,
	onChange,
}: {
	transcript: Transcript;
	onChange: (next: Transcript) => void;
}) {
	const [target, setTarget] = useState(
		transcript.language === "en" ? "si" : "en",
	);
	const [removeFillers, setRemoveFillers] = useState(true);
	const [running, setRunning] = useState<string | null>(null);
	if (!aiBridge()) return null;

	const run = async ({
		label,
		task,
		done,
	}: {
		label: string;
		task: (
			onProgress: (p: number) => void,
		) => Promise<{ transcript: Transcript; changed: number }>;
		done: (changed: number) => string;
	}) => {
		const before = transcript;
		setRunning(label);
		try {
			const result = await task((p) =>
				setRunning(`${label} ${Math.round(p * 100)}%`),
			);
			onChange(result.transcript);
			toast.success(done(result.changed), {
				description: "Changed segments need checking again.",
				action: { label: "Undo", onClick: () => onChange(before) },
			});
		} catch (error) {
			if (
				!(
					error instanceof Error &&
					"code" in error &&
					error.code === "cancelled"
				)
			)
				toast.error(`${label} failed`, {
					description: error instanceof Error ? error.message : String(error),
				});
		} finally {
			setRunning(null);
		}
	};

	return (
		<section className="flex flex-col gap-2" data-transcript-ai>
			<h2 className="m-0 text-sm font-semibold">AI (Gemini)</h2>
			<div className="flex gap-2">
				<select
					aria-label="Translate to"
					className="bg-accent/50 h-8 min-w-0 flex-1 rounded-md border px-2 text-xs"
					value={target}
					onChange={(e) => setTarget(e.target.value)}
				>
					{LANGUAGES.map((l) => (
						<option key={l.code} value={l.code}>
							{l.name}
						</option>
					))}
				</select>
				<Button
					size="sm"
					variant="outline"
					disabled={!!running}
					data-ai-translate
					onClick={() =>
						void run({
							label: "Translating",
							task: (onProgress) =>
								aiTranslate({
									transcript,
									target,
									projectId:
										EditorCore.getInstance().project.getActiveOrNull()?.metadata
											.id,
									onProgress,
								}),
							done: (n) => `Translated ${n} segment${n === 1 ? "" : "s"}`,
						})
					}
				>
					Translate
				</Button>
			</div>
			<div className="flex items-center gap-2">
				<Checkbox
					id="ai-fillers"
					checked={removeFillers}
					onCheckedChange={(v) => setRemoveFillers(v === true)}
				/>
				<Label htmlFor="ai-fillers" className="text-xs">
					Remove filler words
				</Label>
			</div>
			<Button
				size="sm"
				variant="outline"
				disabled={!!running}
				data-ai-cleanup
				onClick={() =>
					void run({
						label: "Cleaning up",
						task: (onProgress) =>
							aiCleanUp({ transcript, removeFillers, onProgress }),
						done: (n) =>
							n
								? `Fixed ${n} segment${n === 1 ? "" : "s"}`
								: "Nothing needed fixing",
					})
				}
			>
				Clean up text
			</Button>
			<AiCostNote estimate={estimateTextJob({ transcript })} />
			{running && (
				<div
					className="text-muted-foreground flex items-center justify-between text-xs"
					role="status"
				>
					{running}
					<Button size="sm" variant="ghost" onClick={cancelAi}>
						Cancel
					</Button>
				</div>
			)}
		</section>
	);
}
