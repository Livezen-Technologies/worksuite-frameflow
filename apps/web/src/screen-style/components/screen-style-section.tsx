"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { UpdateElementsCommand } from "@/commands/timeline/element";
import { useEditor } from "@/editor/use-editor";
import type { VideoElement } from "@/timeline/types";
import { DEFAULT_SCREEN_STYLE, type ScreenStyle } from "../types";

const FILLS = [
	{
		label: "Blue to violet",
		css: "linear-gradient(135deg, #4c8dff 0%, #8b5cf6 100%)",
	},
	{ label: "Sunset", css: "linear-gradient(135deg, #f97316 0%, #ec4899 100%)" },
	{ label: "Mint", css: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)" },
	{ label: "Graphite", css: "#1f2430" },
	{ label: "White", css: "#f4f5f7" },
];

/** Cursor, keystroke and background styling for a screen recording (SC-07, SC-15, SC-17). */
export function ScreenStyleSection({
	element,
	trackId,
}: {
	element: VideoElement;
	trackId: string;
}) {
	const editor = useEditor();
	const style = element.screenStyle ?? DEFAULT_SCREEN_STYLE;
	const hasLog = !!element.screenZoom?.log;
	const save = (next: ScreenStyle) =>
		editor.command.execute({
			command: new UpdateElementsCommand({
				updates: [
					{ trackId, elementId: element.id, patch: { screenStyle: next } },
				],
			}),
		});
	const setCursor = (patch: Partial<ScreenStyle["cursor"]>) =>
		save({ ...style, cursor: { ...style.cursor, ...patch } });
	const setBackground = (patch: Partial<ScreenStyle["background"]>) =>
		save({ ...style, background: { ...style.background, ...patch } });
	const check = ({
		id,
		label,
		checked,
		onChange,
		disabled,
	}: {
		id: string;
		label: string;
		checked: boolean;
		onChange: (v: boolean) => void;
		disabled?: boolean;
	}) => (
		<div className="flex items-center gap-2">
			<Checkbox
				id={id}
				checked={checked}
				disabled={disabled}
				onCheckedChange={(v) => onChange(v === true)}
			/>
			<Label htmlFor={id} className="text-xs font-normal">
				{label}
			</Label>
		</div>
	);
	const slider = ({
		id,
		label,
		value,
		min,
		max,
		step,
		onChange,
		format,
	}: {
		id: string;
		label: string;
		value: number;
		min: number;
		max: number;
		step: number;
		onChange: (v: number) => void;
		format: (v: number) => string;
	}) => (
		<div className="flex items-center gap-2 text-xs">
			<Label htmlFor={id} className="w-20 text-xs font-normal">
				{label}
			</Label>
			<input
				id={id}
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				className="flex-1"
				onChange={(e) => onChange(Number(e.target.value))}
			/>
			<span className="w-10 text-right tabular-nums">{format(value)}</span>
		</div>
	);
	return (
		<div className="flex flex-col gap-3 border-t pt-3" data-screen-style>
			<span className="text-xs font-semibold">Cursor</span>
			{!hasLog && (
				<p className="text-muted-foreground m-0 text-[11px]">
					Cursor and keys need a recording made in FrameFlow with its input log.
				</p>
			)}
			{check({
				id: "style-cursor",
				label: "Draw a clean cursor",
				checked: style.cursor.enabled,
				onChange: (enabled) => setCursor({ enabled }),
				disabled: !hasLog,
			})}
			{style.cursor.enabled && hasLog && (
				<>
					{slider({
						id: "style-cursor-size",
						label: "Size",
						value: style.cursor.size,
						min: 1,
						max: 4,
						step: 0.25,
						onChange: (size) => setCursor({ size }),
						format: (v) => `${v}×`,
					})}
					{check({
						id: "style-smooth",
						label: "Smooth movement",
						checked: style.cursor.smooth,
						onChange: (smooth) => setCursor({ smooth }),
					})}
					{check({
						id: "style-ripple",
						label: "Click ripples",
						checked: style.cursor.clickRipple,
						onChange: (clickRipple) => setCursor({ clickRipple }),
					})}
					{check({
						id: "style-hide",
						label: "Hide when idle",
						checked: style.cursor.hideAfter > 0,
						onChange: (on) => setCursor({ hideAfter: on ? 2 : 0 }),
					})}
				</>
			)}
			{check({
				id: "style-keys",
				label: "Show shortcut keys (e.g. Ctrl + S)",
				checked: style.keys.enabled,
				onChange: (enabled) =>
					save({ ...style, keys: { ...style.keys, enabled } }),
				disabled: !hasLog,
			})}
			<p className="text-muted-foreground m-0 text-[11px]">
				Only shortcut combinations are recorded, never typed text or passwords.
			</p>
			<span className="text-xs font-semibold">Background</span>
			{check({
				id: "style-bg",
				label: "Screen on a background",
				checked: style.background.enabled,
				onChange: (enabled) => setBackground({ enabled }),
			})}
			{style.background.enabled && (
				<>
					<div className="flex flex-wrap gap-1.5" data-screen-fills>
						{FILLS.map((fill) => (
							<button
								key={fill.label}
								type="button"
								title={fill.label}
								aria-label={fill.label}
								aria-pressed={style.background.fill === fill.css}
								onClick={() => setBackground({ fill: fill.css })}
								className="size-7 rounded-md border"
								style={{ background: fill.css }}
							/>
						))}
					</div>
					{slider({
						id: "style-padding",
						label: "Padding",
						value: style.background.padding,
						min: 0,
						max: 0.3,
						step: 0.01,
						onChange: (padding) => setBackground({ padding }),
						format: (v) => `${Math.round(v * 100)}%`,
					})}
					{slider({
						id: "style-radius",
						label: "Corners",
						value: style.background.radius,
						min: 0,
						max: 0.1,
						step: 0.005,
						onChange: (radius) => setBackground({ radius }),
						format: (v) => `${Math.round(v * 1000) / 10}%`,
					})}
					{slider({
						id: "style-shadow",
						label: "Shadow",
						value: style.background.shadow,
						min: 0,
						max: 1,
						step: 0.05,
						onChange: (shadow) => setBackground({ shadow }),
						format: (v) => `${Math.round(v * 100)}%`,
					})}
				</>
			)}
		</div>
	);
}
