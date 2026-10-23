"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/editor/use-editor";
import type { AudioElement } from "@/timeline/types";
import {
	cleanUpClipVoice,
	duckUnderVoice,
	trimClipSilence,
	restoreOriginalVoice,
} from "../actions";

type Job = "clean" | "trim" | "duck" | null;

/** Properties → Voice on an audio clip: clean up, silence trim, auto-duck (AR-15–AR-17). */
export function VoiceTab({
	element,
	trackId,
}: {
	element: AudioElement;
	trackId: string;
}) {
	const editor = useEditor();
	const [job, setJob] = useState<Job>(null);
	const [shortenPauses, setShortenPauses] = useState(true);

	const run = async ({
		name,
		work,
	}: {
		name: Exclude<Job, null>;
		work: () => Promise<string>;
	}) => {
		setJob(name);
		try {
			toast.success(await work());
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Something went wrong",
			);
		} finally {
			setJob(null);
		}
	};

	return (
		<div className="flex flex-col gap-5 p-4 text-sm" data-voice-tab>
			<section className="flex flex-col gap-2">
				<h3 className="font-medium">Clean up voice</h3>
				<p className="text-muted-foreground text-xs">
					Removes background noise, makes speech clearer and levels it to about
					−16 LUFS. The original file is kept.
				</p>
				{element.voiceCleanup ? (
					<Button
						variant="outline"
						size="sm"
						data-voice-original
						onClick={() => restoreOriginalVoice({ editor, element })}
					>
						Use original
					</Button>
				) : (
					<Button
						size="sm"
						data-voice-clean
						disabled={job !== null}
						onClick={() =>
							run({
								name: "clean",
								work: async () => {
									await cleanUpClipVoice({ editor, element });
									return "Voice cleaned up";
								},
							})
						}
					>
						{job === "clean" ? "Cleaning up…" : "Clean up voice"}
					</Button>
				)}
			</section>
			<section className="flex flex-col gap-2">
				<h3 className="font-medium">Trim silence</h3>
				<p className="text-muted-foreground text-xs">
					Cuts the silence at the start and end. Later clips on this track move
					up.
				</p>
				<div className="flex items-center gap-2">
					<Switch
						id="voice-shorten"
						checked={shortenPauses}
						onCheckedChange={setShortenPauses}
					/>
					<Label htmlFor="voice-shorten">Shorten long pauses</Label>
				</div>
				<Button
					size="sm"
					variant="outline"
					data-voice-trim
					disabled={job !== null}
					onClick={() =>
						run({
							name: "trim",
							work: async () => {
								const removed = await trimClipSilence({
									editor,
									element,
									trackId,
									shortenPauses,
								});
								return removed > 0.01
									? `Removed ${removed.toFixed(1)} s of silence`
									: "No silence to remove";
							},
						})
					}
				>
					{job === "trim" ? "Finding silence…" : "Trim silence"}
				</Button>
			</section>
			<section className="flex flex-col gap-2">
				<h3 className="font-medium">Duck music</h3>
				<p className="text-muted-foreground text-xs">
					Lowers the clips on other audio tracks by 12 dB while this voice
					speaks.
				</p>
				<Button
					size="sm"
					variant="outline"
					data-voice-duck
					disabled={job !== null}
					onClick={() =>
						run({
							name: "duck",
							work: async () => {
								const count = await duckUnderVoice({
									editor,
									element,
									trackId,
								});
								return count
									? `Ducked ${count} clip${count === 1 ? "" : "s"}`
									: "No music under this voice";
							},
						})
					}
				>
					{job === "duck" ? "Listening…" : "Duck music under this voice"}
				</Button>
			</section>
		</div>
	);
}
