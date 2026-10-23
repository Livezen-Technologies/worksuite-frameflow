"use client";

import { toast } from "sonner";
import { UpdateElementsCommand } from "@/commands/timeline/element/update-elements";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import type { VideoElement } from "@/timeline/types";
import { mediaTime, roundMediaTime } from "@/wasm";
import {
	applyGradeToAngle,
	setAudio,
	setOffset,
	smartSwitch,
	switchAngle,
} from "../service";
import { useMulticamUi } from "../store";

/** Properties → Multicam on a cut of a multicam clip (SC-27–SC-29). */
export function MulticamTab({ element }: { element: VideoElement }) {
	const editor = useEditor();
	const tag = element.multicam;
	if (!tag) return null;
	const { group, groupId, angle } = {
		group: tag.group,
		groupId: tag.groupId,
		angle: tag.angle,
	};
	const seekIntoThisCut = () =>
		editor.playback.seek({
			time: roundMediaTime({
				time: mediaTime({
					ticks: element.startTime + Math.min(element.duration - 1, 1),
				}),
			}),
		});

	return (
		<div className="flex flex-col gap-4 p-3 text-sm" data-multicam-tab>
			<section className="flex flex-col gap-2">
				<span className="text-xs font-semibold">This cut shows</span>
				<div className="flex flex-wrap gap-1.5">
					{group.angles.map((a, i) => (
						<Button
							key={a.mediaId + i}
							size="sm"
							variant={i === angle ? "default" : "outline"}
							data-switch-angle={i + 1}
							onClick={() => {
								seekIntoThisCut();
								switchAngle({ editor, groupId, angle: i });
							}}
						>
							{i + 1} · {a.name}
						</Button>
					))}
				</div>
				<Button
					size="sm"
					variant="outline"
					onClick={() => useMulticamUi.getState().openViewer(groupId)}
					data-open-angle-viewer
				>
					Open angle viewer
				</Button>
			</section>

			<section className="flex flex-col gap-2">
				<span className="text-xs font-semibold">Audio</span>
				<select
					aria-label="Multicam audio"
					className="bg-accent/50 h-8 rounded-md border px-2 text-sm"
					value={String(group.audio)}
					onChange={(e) =>
						setAudio({
							editor,
							groupId,
							audio:
								e.target.value === "follow" ? "follow" : Number(e.target.value),
						})
					}
				>
					<option value="follow">Follow the picture</option>
					{group.angles.map((a, i) => (
						<option key={a.mediaId + i} value={i}>
							Always from {a.name}
						</option>
					))}
				</select>
			</section>

			<section className="flex flex-col gap-2">
				<span className="text-xs font-semibold">Match cameras</span>
				<Button
					size="sm"
					variant="outline"
					onClick={() => {
						const updates = applyGradeToAngle({ editor, element });
						if (updates.length)
							editor.command.execute({
								command: new UpdateElementsCommand({ updates }),
							});
						toast.success(
							`Copied this grade to ${updates.length} other ${group.angles[angle].name} cut${updates.length === 1 ? "" : "s"}`,
						);
					}}
				>
					Use this grade for every {group.angles[angle].name} cut
				</Button>
			</section>

			<section className="flex flex-col gap-2">
				<span className="text-xs font-semibold">Smart switching</span>
				<Button
					size="sm"
					variant="outline"
					data-smart-switch
					onClick={() =>
						void smartSwitch({
							editor,
							groupId,
							assets: editor.media.getAssets(),
						}).then((n) =>
							toast.success(
								`Cut to whoever is speaking: ${n} shot${n === 1 ? "" : "s"}`,
								{
									description: "Undo to go back; change any cut afterwards.",
								},
							),
						)
					}
				>
					Cut to whoever is speaking
				</Button>
			</section>

			<section className="flex flex-col gap-1.5">
				<span className="text-xs font-semibold">
					Sync (
					{group.sync === "audio"
						? "by sound"
						: group.sync === "start"
							? "by start time"
							: "by hand"}
					)
				</span>
				{group.angles.map((a, i) => (
					<label
						key={a.mediaId + i}
						className="flex items-center justify-between gap-2 text-xs"
					>
						{a.name} starts at
						<input
							type="number"
							step={0.01}
							min={0}
							className="bg-accent/50 h-7 w-24 rounded-md border px-2"
							defaultValue={a.offset.toFixed(2)}
							onBlur={(e) =>
								setOffset({
									editor,
									groupId,
									angle: i,
									offset: Number(e.target.value) || 0,
								})
							}
						/>
						s
					</label>
				))}
			</section>
		</div>
	);
}
