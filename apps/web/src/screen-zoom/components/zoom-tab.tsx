"use client";

import { ScreenStyleSection } from "@/screen-style/components/screen-style-section";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { UpdateElementsCommand } from "@/commands/timeline/element/update-elements";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/editor/use-editor";
import type { VideoElement } from "@/timeline/types";
import { generateUUID } from "@/utils/id";
import { mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";
import { clampLevel, generateZooms } from "../generate";
import {
	DEFAULT_ZOOM_SETTINGS,
	MAX_LEVEL,
	MIN_LEVEL,
	type ScreenZoom,
	type ZoomSegment,
	type ZoomSensitivity,
} from "../types";

const fmt = (s: number) =>
	`${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/** Properties → Zoom: auto zooms from a screen recording, or hand-made zooms on any clip (SC-11–SC-18). */
export function ZoomTab({
	element,
	trackId,
}: {
	element: VideoElement;
	trackId: string;
}) {
	const editor = useEditor();
	const zoom: ScreenZoom = element.screenZoom ?? {
		segments: [],
		settings: DEFAULT_ZOOM_SETTINGS,
	};
	const { settings } = zoom;
	const trim = element.trimStart / TICKS_PER_SECOND;
	const clipSeconds = element.duration / TICKS_PER_SECOND;

	const save = (next: ScreenZoom) =>
		editor.command.execute({
			command: new UpdateElementsCommand({
				updates: [
					{ trackId, elementId: element.id, patch: { screenZoom: next } },
				],
			}),
		});
	const update = ({ id, patch }: { id: string; patch: Partial<ZoomSegment> }) =>
		save({
			...zoom,
			segments: zoom.segments.map((z) =>
				z.id === id ? { ...z, ...patch } : z,
			),
		});

	const playheadSource = () =>
		(editor.playback.getCurrentTime() - element.startTime) / TICKS_PER_SECOND +
		trim;

	const add = () => {
		const at = Math.min(
			Math.max(trim, playheadSource()),
			trim + clipSeconds - 1,
		);
		const segment: ZoomSegment = {
			id: generateUUID(),
			start: at,
			end: Math.min(trim + clipSeconds, at + 3),
			level: settings.level,
			follow: !!zoom.log && settings.follow,
			x: 0.5,
			y: 0.5,
			ease: settings.ease,
		};
		save({
			...zoom,
			segments: [...zoom.segments, segment].sort((a, b) => a.start - b.start),
		});
	};

	const regenerate = () => {
		if (!zoom.log) return;
		const segments = generateZooms({
			log: zoom.log,
			duration: trim + clipSeconds,
			settings,
		});
		save({ ...zoom, segments });
		toast.success(
			`Made ${segments.length} zoom${segments.length === 1 ? "" : "s"} from the clicks and typing`,
		);
	};

	const seek = (source: number) =>
		editor.playback.seek({
			time: mediaTimeFromSeconds({
				seconds: element.startTime / TICKS_PER_SECOND + source - trim,
			}),
		});

	return (
		<div className="flex flex-col gap-4 p-3 text-sm" data-zoom-tab>
			<p className="text-muted-foreground text-xs">
				{zoom.log
					? `Recorded ${zoom.log.clicks.length} clicks and ${zoom.log.typing.length} typing moments. Zooms follow them; edit, add or remove any.`
					: "Zoom in on part of this clip. Each zoom eases in and out."}
			</p>

			{zoom.log && (
				<section
					className="flex flex-col gap-2 rounded-md border p-2"
					data-zoom-settings
				>
					<span className="text-xs font-semibold">Auto zoom</span>
					<div className="flex items-center justify-between gap-2">
						<span className="text-xs">Default level</span>
						<input
							type="range"
							aria-label="Default zoom level"
							min={MIN_LEVEL}
							max={MAX_LEVEL}
							step={0.25}
							value={settings.level}
							onChange={(e) =>
								save({
									...zoom,
									settings: { ...settings, level: Number(e.target.value) },
								})
							}
						/>
						<span className="w-10 text-right text-xs tabular-nums">
							{settings.level}×
						</span>
					</div>
					<div className="flex items-center justify-between gap-2">
						<span className="text-xs">Sensitivity</span>
						<select
							aria-label="Zoom sensitivity"
							className="bg-accent/50 h-7 rounded-md border px-2 text-xs"
							value={settings.sensitivity}
							onChange={(e) => {
								const v = (["low", "medium", "high"] as const).find(
									(x) => x === e.target.value,
								);
								if (v)
									save({
										...zoom,
										settings: {
											...settings,
											sensitivity: v satisfies ZoomSensitivity,
										},
									});
							}}
						>
							<option value="low">Fewer zooms</option>
							<option value="medium">Balanced</option>
							<option value="high">More zooms</option>
						</select>
					</div>
					<div className="flex items-center justify-between gap-2">
						<Label htmlFor="zoom-follow" className="text-xs">
							Follow the cursor
						</Label>
						<Switch
							id="zoom-follow"
							checked={settings.follow}
							onCheckedChange={(v) =>
								save({ ...zoom, settings: { ...settings, follow: v } })
							}
						/>
					</div>
					<Button
						size="sm"
						variant="outline"
						onClick={regenerate}
						data-zoom-regenerate
					>
						<RefreshCw className="mr-1 size-3.5" /> Re-generate zooms
					</Button>
				</section>
			)}

			<div className="flex items-center justify-between">
				<span className="text-xs font-semibold">
					Zooms ({zoom.segments.length})
				</span>
				<Button size="sm" variant="outline" onClick={add} data-zoom-add>
					<Plus className="mr-1 size-3.5" /> Add at playhead
				</Button>
			</div>

			<ul className="flex flex-col gap-2" data-zoom-list>
				{zoom.segments.map((z) => (
					<li
						key={z.id}
						className="flex flex-col gap-1.5 rounded-md border p-2"
					>
						<div className="flex items-center justify-between">
							<button
								type="button"
								className="text-xs tabular-nums underline-offset-2 hover:underline"
								onClick={() => seek(Math.min(z.end, z.start + z.ease))}
								title="Go to where this zoom is fully in"
							>
								{fmt(Math.max(0, z.start - trim))} –{" "}
								{fmt(Math.max(0, z.end - trim))}
							</button>
							<Button
								size="icon"
								variant="ghost"
								className="size-6"
								aria-label="Delete zoom"
								onClick={() =>
									save({
										...zoom,
										segments: zoom.segments.filter((s) => s.id !== z.id),
									})
								}
							>
								<Trash2 className="size-3.5" />
							</Button>
						</div>
						<label className="flex items-center gap-2 text-xs">
							Level
							<input
								type="range"
								className="flex-1"
								min={MIN_LEVEL}
								max={MAX_LEVEL}
								step={0.25}
								value={z.level}
								onChange={(e) =>
									update({
										id: z.id,
										patch: { level: clampLevel(Number(e.target.value)) },
									})
								}
							/>
							<span className="w-9 text-right tabular-nums">{z.level}×</span>
						</label>
						<label className="flex items-center gap-2 text-xs">
							Length
							<input
								type="range"
								className="flex-1"
								min={0.8}
								max={Math.max(1, trim + clipSeconds - z.start)}
								step={0.1}
								value={z.end - z.start}
								onChange={(e) =>
									update({
										id: z.id,
										patch: { end: z.start + Number(e.target.value) },
									})
								}
							/>
							<span className="w-9 text-right tabular-nums">
								{(z.end - z.start).toFixed(1)}s
							</span>
						</label>
						{zoom.log && (
							<div className="flex items-center gap-2 text-xs">
								<Switch
									id={`follow-${z.id}`}
									checked={z.follow}
									onCheckedChange={(v) =>
										update({ id: z.id, patch: { follow: v } })
									}
								/>
								<Label htmlFor={`follow-${z.id}`} className="text-xs">
									Follow cursor
								</Label>
							</div>
						)}
						{!z.follow && (
							<div className="grid grid-cols-2 gap-2">
								<label className="flex items-center gap-1 text-xs">
									X
									<input
										type="range"
										className="flex-1"
										min={0}
										max={1}
										step={0.01}
										value={z.x}
										onChange={(e) =>
											update({ id: z.id, patch: { x: Number(e.target.value) } })
										}
									/>
								</label>
								<label className="flex items-center gap-1 text-xs">
									Y
									<input
										type="range"
										className="flex-1"
										min={0}
										max={1}
										step={0.01}
										value={z.y}
										onChange={(e) =>
											update({ id: z.id, patch: { y: Number(e.target.value) } })
										}
									/>
								</label>
							</div>
						)}
						<label className="flex items-center gap-2 text-xs">
							Ease
							<input
								type="range"
								className="flex-1"
								min={0.1}
								max={2}
								step={0.1}
								value={z.ease}
								onChange={(e) =>
									update({ id: z.id, patch: { ease: Number(e.target.value) } })
								}
							/>
							<span className="w-9 text-right tabular-nums">
								{z.ease.toFixed(1)}s
							</span>
						</label>
					</li>
				))}
			</ul>
			<ScreenStyleSection element={element} trackId={trackId} />
		</div>
	);
}
