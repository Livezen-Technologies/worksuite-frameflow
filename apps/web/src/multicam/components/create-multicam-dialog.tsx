"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { createMulticam, type SyncMethod } from "../service";
import { useMulticamUi } from "../store";
import { MAX_ANGLES, MIN_ANGLES } from "../types";

const SYNC: { value: SyncMethod; label: string; hint: string }[] = [
	{
		value: "audio",
		label: "Audio waveform",
		hint: "Best: lines up claps, speech and music",
	},
	{
		value: "start",
		label: "Recording start time",
		hint: "From each file's time; cameras' clocks must match",
	},
	{
		value: "manual",
		label: "Line up by hand",
		hint: "All start together; nudge each angle afterwards",
	},
];

/** Create a multicam clip from 2–9 videos (SC-24, SC-25). */
export function CreateMulticamDialog() {
	const open = useMulticamUi((s) => s.createOpen);
	const setOpen = useMulticamUi((s) => s.setCreateOpen);
	const openViewer = useMulticamUi((s) => s.openViewer);
	const editor = useEditor();
	const assets = useEditor((e) => e.media.getAssets());
	const videos = useMemo(
		() => assets.filter((a) => a.type === "video" && !a.ephemeral),
		[assets],
	);
	const [chosen, setChosen] = useState<string[]>([]);
	const [name, setName] = useState("Multicam");
	const [sync, setSync] = useState<SyncMethod>("audio");
	const [busy, setBusy] = useState<string | null>(null);

	const toggle = (id: string) =>
		setChosen((c) =>
			c.includes(id)
				? c.filter((x) => x !== id)
				: c.length < MAX_ANGLES
					? [...c, id]
					: c,
		);

	const create = async () => {
		const picked = chosen
			.map((id) => videos.find((v) => v.id === id))
			.filter((a) => !!a);
		setBusy("Starting");
		try {
			const { group, confidence } = await createMulticam({
				editor,
				assets: picked,
				name: name.trim() || "Multicam",
				sync,
				onProgress: setBusy,
			});
			const weak = confidence.findIndex((c) => c < 0.15);
			toast.success(`Made "${group.name}" with ${group.angles.length} angles`, {
				description:
					weak > 0
						? `${group.angles[weak].name} didn't line up clearly by sound. Check it in the angle viewer and nudge it in the Multicam tab.`
						: "Press 1–9 in the angle viewer while it plays to cut between angles.",
			});
			setOpen(false);
			setChosen([]);
			openViewer(group.id);
		} catch (error) {
			toast.error("Couldn't make the multicam clip", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(null);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
			<DialogContent className="max-w-lg" data-multicam-create>
				<DialogHeader>
					<DialogTitle>New multicam clip</DialogTitle>
				</DialogHeader>
				<p className="text-muted-foreground text-xs">
					Pick {MIN_ANGLES}–{MAX_ANGLES} clips of the same moment: cameras,
					phones or screen recordings. Angle 1 is the first one you pick.
				</p>
				<ul
					className="max-h-56 overflow-auto rounded-md border"
					data-multicam-videos
				>
					{videos.length === 0 && (
						<li className="text-muted-foreground p-3 text-xs">
							Import some videos first.
						</li>
					)}
					{videos.map((v) => {
						const index = chosen.indexOf(v.id);
						return (
							<li key={v.id}>
								<label className="hover:bg-accent/40 flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm">
									<input
										type="checkbox"
										checked={index >= 0}
										onChange={() => toggle(v.id)}
									/>
									<span className="w-12 text-xs text-sky-400">
										{index >= 0 ? `Cam ${index + 1}` : ""}
									</span>
									<span className="truncate">{v.name}</span>
									<span className="text-muted-foreground ml-auto text-xs">
										{(v.duration ?? 0).toFixed(1)}s
									</span>
								</label>
							</li>
						);
					})}
				</ul>
				<div className="flex items-center gap-2 text-sm">
					<span id="multicam-name">Name</span>
					<Input
						aria-labelledby="multicam-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="h-8"
					/>
				</div>
				<fieldset className="flex flex-col gap-1">
					<legend className="mb-1 text-sm">Sync by</legend>
					{SYNC.map((s) => (
						<label key={s.value} className="flex items-start gap-2 text-sm">
							<input
								type="radio"
								name="multicam-sync"
								checked={sync === s.value}
								onChange={() => setSync(s.value)}
							/>
							<span>
								{s.label}
								<span className="text-muted-foreground block text-xs">
									{s.hint}
								</span>
							</span>
						</label>
					))}
				</fieldset>
				<div className="flex items-center justify-end gap-2">
					{busy && (
						<span
							className="text-muted-foreground mr-auto text-xs"
							role="status"
						>
							{busy}…
						</span>
					)}
					<Button
						variant="outline"
						disabled={!!busy}
						onClick={() => setOpen(false)}
					>
						Cancel
					</Button>
					<Button
						disabled={!!busy || chosen.length < MIN_ANGLES}
						onClick={() => void create()}
						data-multicam-make
					>
						Make multicam clip
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
