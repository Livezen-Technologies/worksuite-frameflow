"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import { useTranscriptStore } from "@/transcript/store";
import { duckMusic, removeDucking, removeFillerWords } from "../actions";
import { DEFAULT_FILLERS } from "../smart-edits";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Smart edits (AE-03, AE-06): duck music under voice, remove filler words. */
export function SmartEditsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg" data-smart-edits>
				<DialogHeader>
					<DialogTitle>Smart edits</DialogTitle>
				</DialogHeader>
				{/* Mounted on open, so the track picks start fresh each time. */}
				{open && <SmartEditsBody />}
			</DialogContent>
		</Dialog>
	);
}

type Named = { id: string; name: string };
const findTrack = ({
	named,
	re,
	not,
}: {
	named: Named[];
	re: RegExp;
	not?: string;
}) => named.find((t) => t.id !== not && re.test(t.name))?.id;

function SmartEditsBody() {
	const editor = useEditor();
	const tracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const projectId = useEditor((e) => e.project.getActive().metadata.id);
	const transcript = useTranscriptStore((s) => s.byProject[projectId]);
	const named = [
		...(tracks.main.elements.length
			? [{ id: tracks.main.id, name: "Video sound" }]
			: []),
		...tracks.audio.map((t, i) => ({
			id: t.id,
			name: t.elements[0]?.name ?? `Audio ${i + 1}`,
		})),
	];
	// Sensible picks: tracks named like music and like a voice.
	const [music, setMusic] = useState(
		() =>
			findTrack({ named, re: /music|song|bgm|beat/i }) ??
			named[named.length - 1]?.id ??
			"",
	);
	const [voice, setVoice] = useState(
		() =>
			findTrack({
				named,
				re: /voice|talk|narrat|speech|mic|record|vo\b|podcast/i,
				not: music,
			}) ??
			named.find((t) => t.id !== music)?.id ??
			"",
	);
	const [depth, setDepth] = useState(12);
	const [release, setRelease] = useState(0.5);
	const [fillers, setFillers] = useState(DEFAULT_FILLERS.join(", "));
	const [busy, setBusy] = useState(false);
	const hasWords = !!transcript?.segments.some((s) => s.words?.length);

	const duck = async () => {
		setBusy(true);
		try {
			const phrases = await duckMusic({
				editor,
				musicTrackId: music,
				voiceTrackIds: [voice],
				depth,
				release,
			});
			toast.success(
				`Music ducked under ${phrases} spoken phrase${phrases === 1 ? "" : "s"}`,
			);
		} catch (e) {
			toast.error(errorText(e));
		} finally {
			setBusy(false);
		}
	};

	const removeFillers = () => {
		const result = removeFillerWords({
			editor,
			fillers: fillers
				.split(",")
				.map((f) => f.trim())
				.filter(Boolean),
		});
		if (!result)
			return toast.error(
				"Transcribe the project first: filler words are found from the transcript's word timings.",
			);
		if (!result.count) return toast.info("No filler words found.");
		toast.success(
			`Removed ${result.count} filler word${result.count === 1 ? "" : "s"} (${result.seconds.toFixed(1)} s)`,
			{
				action: { label: "Undo", onClick: () => editor.command.undo() },
			},
		);
	};

	return (
		<div className="flex flex-col gap-5 p-4 text-sm">
			<section className="flex flex-col gap-3">
				<h3 className="m-0 font-semibold">Duck music under voice</h3>
				<div className="grid grid-cols-2 gap-2 text-xs">
					<label className="flex flex-col gap-1">
						Music track
						<select
							className="rounded border bg-transparent p-1.5"
							value={music}
							onChange={(e) => setMusic(e.target.value)}
							data-duck-music
						>
							{named.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1">
						Voice track
						<select
							className="rounded border bg-transparent p-1.5"
							value={voice}
							onChange={(e) => setVoice(e.target.value)}
							data-duck-voice
						>
							{named.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name}
								</option>
							))}
						</select>
					</label>
				</div>
				<div className="flex flex-col gap-1.5 text-xs">
					<div className="flex justify-between">
						<span>Depth</span>
						<span className="text-muted-foreground">−{depth} dB</span>
					</div>
					<Slider
						min={3}
						max={30}
						step={1}
						value={[depth]}
						onValueChange={([v]) => setDepth(v ?? 12)}
					/>
					<div className="flex justify-between">
						<span>Release (back up after speech)</span>
						<span className="text-muted-foreground">
							{release.toFixed(1)} s
						</span>
					</div>
					<Slider
						min={0.1}
						max={2}
						step={0.1}
						value={[release]}
						onValueChange={([v]) => setRelease(v ?? 0.5)}
					/>
				</div>
				<div className="flex gap-2">
					<Button
						disabled={busy || !music || !voice || music === voice}
						onClick={() => void duck()}
						data-duck-run
					>
						{busy ? "Listening for speech…" : "Duck music"}
					</Button>
					<Button
						variant="ghost"
						disabled={!music}
						onClick={() => removeDucking({ editor, musicTrackId: music })}
					>
						Remove ducking
					</Button>
				</div>
			</section>
			<section className="flex flex-col gap-3 border-t pt-4">
				<h3 className="m-0 font-semibold">Remove filler words</h3>
				<p className="text-muted-foreground m-0 text-xs">
					{hasWords
						? "Cuts each filler word out of the whole timeline (video and audio), in one undo step."
						: "Needs a transcript with word timings: transcribe the project in the Transcript panel first."}
				</p>
				<label className="flex flex-col gap-1 text-xs">
					Words to remove
					<input
						className="rounded border bg-transparent px-2 py-1.5"
						value={fillers}
						onChange={(e) => setFillers(e.target.value)}
						data-filler-words
					/>
				</label>
				<Button
					variant="outline"
					disabled={!hasWords}
					onClick={removeFillers}
					data-filler-run
				>
					Remove filler words
				</Button>
			</section>
		</div>
	);
}
