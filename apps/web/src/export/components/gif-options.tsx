"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { GifOptions } from "../gif";

const selectClass =
	"bg-background h-7 rounded-md border px-2 text-xs focus-visible:outline-none";

/** Loop, colours, dithering and length for GIF export (SRS EX-25). */
export function GifOptionsRows({
	value,
	onChange,
	playhead,
	selection,
}: {
	value: GifOptions;
	onChange: (value: GifOptions) => void;
	/** Playhead, in seconds, for "Start at playhead" (EX-02). */
	playhead?: number;
	/** The selected clips' span, in seconds. */
	selection?: { start: number; length: number } | null;
}) {
	const set = (patch: Partial<GifOptions>) => onChange({ ...value, ...patch });
	const lengths = [5, 10, 15, 30];
	const custom = value.maxSeconds && !lengths.includes(value.maxSeconds) ? value.maxSeconds : null;
	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-gif-options>
			<div className="col-span-2 flex flex-wrap items-end gap-2 sm:col-span-4">
				<div className="flex flex-col gap-1">
					<Label htmlFor="gif-start" className="text-muted-foreground text-xs">
						Start at (s)
					</Label>
					<input
						id="gif-start"
						type="number"
						min={0}
						step={0.1}
						className={`${selectClass} w-24`}
						value={Math.round((value.startSeconds ?? 0) * 10) / 10}
						onChange={(e) => set({ startSeconds: Math.max(0, Number(e.target.value) || 0) })}
						data-gif-start
					/>
				</div>
				<button type="button" className="text-primary h-7 text-xs" onClick={() => set({ startSeconds: 0 })}>
					Beginning
				</button>
				{playhead !== undefined && (
					<button type="button" className="text-primary h-7 text-xs" onClick={() => set({ startSeconds: playhead })} data-gif-from-playhead>
						Playhead
					</button>
				)}
				{selection && (
					<button
						type="button"
						className="text-primary h-7 text-xs"
						onClick={() => set({ startSeconds: selection.start, maxSeconds: Math.max(0.1, Math.round(selection.length * 10) / 10) })}
						data-gif-from-selection
					>
						Selected clips ({Math.round(selection.length * 10) / 10} s)
					</button>
				)}
			</div>
			<div className="flex flex-col gap-1">
				<Label htmlFor="gif-colors" className="text-muted-foreground text-xs">
					Colours
				</Label>
				<select
					id="gif-colors"
					className={selectClass}
					value={value.colors}
					onChange={(e) => set({ colors: Number(e.target.value) })}
				>
					{[32, 64, 128, 256].map((n) => (
						<option key={n} value={n}>
							{n}
						</option>
					))}
				</select>
			</div>
			<div className="flex flex-col gap-1">
				<Label htmlFor="gif-loop" className="text-muted-foreground text-xs">
					Loop
				</Label>
				<select
					id="gif-loop"
					className={selectClass}
					value={String(value.loop)}
					onChange={(e) => {
						const v = e.target.value;
						set({ loop: v === "forever" || v === "once" ? v : Number(v) });
					}}
				>
					<option value="forever">Forever</option>
					<option value="once">Play once</option>
					<option value="2">2 times</option>
					<option value="3">3 times</option>
				</select>
			</div>
			<div className="flex flex-col gap-1">
				<Label htmlFor="gif-length" className="text-muted-foreground text-xs">
					Length limit
				</Label>
				<select
					id="gif-length"
					className={selectClass}
					value={String(value.maxSeconds ?? 0)}
					onChange={(e) => {
						const n = Number(e.target.value);
						set({ maxSeconds: n > 0 ? n : undefined });
					}}
				>
					{custom && <option value={String(custom)}>{custom} s</option>}
					<option value="5">5 s</option>
					<option value="10">10 s</option>
					<option value="15">15 s</option>
					<option value="30">30 s</option>
					<option value="0">Whole video</option>
				</select>
			</div>
			<div className="flex items-end gap-2 pb-1">
				<Checkbox
					id="gif-dither"
					checked={value.dither}
					onCheckedChange={(v) => set({ dither: !!v })}
				/>
				<Label htmlFor="gif-dither" className="text-xs font-normal">
					Dithering
				</Label>
			</div>
		</div>
	);
}
