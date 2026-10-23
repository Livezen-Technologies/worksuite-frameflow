"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import type { ImageElement, TimelineTrack, VideoElement } from "@/timeline";
import { TICKS_PER_SECOND } from "@/wasm";
import { cn } from "@/utils/ui";
import {
	TRANSITION_CATEGORIES,
	TRANSITIONS,
	getTransitionDefinition,
} from "../definitions";
import {
	DEFAULT_TRANSITION,
	type ClipTransition,
	type TransitionAlignment,
	type TransitionCategory,
	type TransitionDirection,
	type TransitionEasing,
	type TransitionType,
} from "../types";
import { findClipBefore } from "../windows";
import { TransitionThumbnail } from "./transition-thumbnail";

type Clip = VideoElement | ImageElement;
type Cut = { trackId: string; from: Clip; to: Clip };

const EASINGS: { value: TransitionEasing; label: string }[] = [
	{ value: "ease-in-out", label: "Ease in-out" },
	{ value: "linear", label: "Linear" },
	{ value: "ease-in", label: "Ease in" },
	{ value: "ease-out", label: "Ease out" },
];
const DIRECTIONS: { value: TransitionDirection; label: string }[] = [
	{ value: "left", label: "Left" },
	{ value: "right", label: "Right" },
	{ value: "up", label: "Up" },
	{ value: "down", label: "Down" },
];
const ALIGNMENTS: { value: TransitionAlignment; label: string }[] = [
	{ value: "center", label: "Centre on cut" },
	{ value: "start", label: "Start on cut" },
	{ value: "end", label: "End on cut" },
];

function isClip(element: { type: string }): element is Clip {
	return element.type === "video" || element.type === "image";
}

function trackClips(track: TimelineTrack): Clip[] {
	return track.elements.filter(isClip);
}

/** The cut into the selected clip, or the cut after it when it's the first clip. */
function selectedCut({
	track,
	clip,
}: {
	track: TimelineTrack;
	clip: Clip;
}): Cut | null {
	const clips = trackClips(track);
	const before = findClipBefore({
		clips,
		clip,
		ticksPerSecond: TICKS_PER_SECOND,
	});
	if (before) return { trackId: track.id, from: before, to: clip };
	const after = clips.find((other) =>
		findClipBefore({
			clips: [clip],
			clip: other,
			ticksPerSecond: TICKS_PER_SECOND,
		}),
	);
	return after ? { trackId: track.id, from: clip, to: after } : null;
}

/** Transitions tab (SRS 17.3, canvas screen 14). */
export function TransitionsView() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	const { selectedElements } = useElementSelection();
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<TransitionCategory | "All">("All");
	const [type, setType] = useState<TransitionType>("cross-dissolve");
	const projectTransition = useEditor(
		(e) => e.project.getActiveOrNull()?.settings.defaults?.transitionSeconds,
	);
	const [settings, setSettings] = useState(() => ({
		...DEFAULT_TRANSITION,
		duration: projectTransition ?? DEFAULT_TRANSITION.duration,
	}));
	const [hovered, setHovered] = useState<TransitionType | null>(null);

	const selection = editor.timeline.getElementsWithTracks({
		elements: selectedElements,
	})[0];
	const cut =
		selection && isClip(selection.element)
			? selectedCut({ track: selection.track, clip: selection.element })
			: null;
	const existing = cut?.to.transitionIn;

	// Show the selected cut's own transition when the selection moves to it.
	const cutKey = cut ? `${cut.from.id}>${cut.to.id}` : null;
	const [shownCut, setShownCut] = useState<string | null>(null);
	if (cutKey !== shownCut) {
		setShownCut(cutKey);
		if (existing) {
			const { type: existingType, ...rest } = existing;
			setType(existingType);
			setSettings(rest);
		}
	}

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return TRANSITIONS.filter(
			(t) =>
				(category === "All" || t.category === category) &&
				(!q ||
					t.name.toLowerCase().includes(q) ||
					t.keywords.some((k) => k.includes(q))),
		);
	}, [query, category]);

	const definition = getTransitionDefinition(type);
	const transition: ClipTransition = { type, ...settings };
	const heldSeconds = cut ? holdNeeded({ cut, transition }) : 0;

	const applyToCut = ({
		target,
		value,
	}: {
		target: Cut;
		value: ClipTransition | undefined;
	}) => ({
		trackId: target.trackId,
		elementId: target.to.id,
		patch: { transitionIn: value },
	});

	const applySelected = () => {
		if (!cut) return;
		editor.timeline.updateElements({
			updates: [applyToCut({ target: cut, value: transition })],
		});
		toast.success(
			`${definition.name} added to the cut before “${cut.to.name}”`,
		);
	};

	const applyAll = () => {
		if (!selection) return;
		const clips = trackClips(selection.track);
		const updates = clips
			.filter((clip) =>
				findClipBefore({ clips, clip, ticksPerSecond: TICKS_PER_SECOND }),
			)
			.map((clip) => ({
				trackId: selection.track.id,
				elementId: clip.id,
				patch: { transitionIn: transition },
			}));
		if (updates.length === 0) {
			toast.info("This track has no cuts between touching clips.");
			return;
		}
		editor.timeline.updateElements({ updates });
		toast.success(
			`${definition.name} added to ${updates.length} cut${updates.length === 1 ? "" : "s"}`,
		);
	};

	return (
		<PanelView title="Transitions">
			<div className="flex flex-col gap-3 pb-4">
				<label htmlFor="transition-search" className="sr-only">
					Search transitions
				</label>
				<Input
					id="transition-search"
					placeholder="Search transitions"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
				<div
					className="flex flex-wrap gap-1"
					role="group"
					aria-label="Category"
				>
					{(["All", ...TRANSITION_CATEGORIES] as const).map((name) => (
						<button
							key={name}
							type="button"
							aria-pressed={category === name}
							onClick={() => setCategory(name)}
							className={cn(
								"h-7 rounded-full border px-2.5 text-xs",
								category === name
									? "bg-secondary text-secondary-foreground"
									: "bg-popover hover:bg-accent",
							)}
						>
							{name}
						</button>
					))}
				</div>

				<div
					className="grid gap-2"
					style={{
						gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))",
					}}
				>
					{visible.map((item) => (
						<button
							key={item.type}
							type="button"
							aria-pressed={type === item.type}
							onClick={() => setType(item.type)}
							onDoubleClick={() => {
								setType(item.type);
								if (cut) {
									editor.timeline.updateElements({
										updates: [
											applyToCut({
												target: cut,
												value: { ...transition, type: item.type },
											}),
										],
									});
									toast.success(
										`${item.name} added to the cut before “${cut.to.name}”`,
									);
								}
							}}
							onMouseEnter={() => setHovered(item.type)}
							onMouseLeave={() => setHovered(null)}
							onFocus={() => setHovered(item.type)}
							onBlur={() => setHovered(null)}
							title={`${item.name} — double-click to apply to the selected cut`}
							className={cn(
								"bg-card flex flex-col gap-1.5 rounded-lg border-2 p-1.5 text-left",
								type === item.type
									? "border-primary"
									: "border-transparent hover:border-border",
							)}
						>
							<TransitionThumbnail
								type={item.type}
								direction={settings.direction}
								easing={settings.easing}
								playing={hovered === item.type}
							/>
							<span className="text-xs font-semibold">{item.name}</span>
						</button>
					))}
				</div>
				{visible.length === 0 && (
					<p className="text-muted-foreground text-sm">
						No transitions match “{query}”.
					</p>
				)}

				<section
					aria-labelledby="transition-settings"
					className="bg-card flex flex-col gap-3 rounded-lg border p-3"
				>
					<h3 id="transition-settings" className="m-0 text-sm font-semibold">
						{definition.name}
					</h3>
					<TransitionThumbnail
						type={type}
						direction={settings.direction}
						easing={settings.easing}
						playing
					/>
					<label className="grid grid-cols-[64px_1fr_44px] items-center gap-2 text-xs">
						Duration
						<input
							type="range"
							min={0.1}
							max={3}
							step={0.1}
							value={settings.duration}
							onChange={(event) =>
								setSettings({
									...settings,
									duration: Number(event.target.value),
								})
							}
							className="accent-primary"
						/>
						<span className="text-muted-foreground text-right tabular-nums">
							{settings.duration.toFixed(1)} s
						</span>
					</label>
					<SelectRow
						label="Easing"
						value={settings.easing}
						options={EASINGS}
						onChange={(easing) => setSettings({ ...settings, easing })}
					/>
					{definition.directional && (
						<SelectRow
							label="Direction"
							value={settings.direction}
							options={DIRECTIONS}
							onChange={(direction) => setSettings({ ...settings, direction })}
						/>
					)}
					<SelectRow
						label="Alignment"
						value={settings.alignment}
						options={ALIGNMENTS}
						onChange={(alignment) => setSettings({ ...settings, alignment })}
					/>

					<p
						className="text-muted-foreground m-0 text-xs leading-relaxed"
						role="status"
					>
						{cut
							? `Cut: “${cut.from.name}” → “${cut.to.name}”${existing ? ` · has ${getTransitionDefinition(existing.type).name}` : ""}`
							: selection
								? "The selected clip doesn't touch another clip on its track."
								: "Select a clip next to a cut on the timeline."}
					</p>
					{heldSeconds > 0.01 && (
						<p className="text-caution m-0 text-xs leading-relaxed">
							The transition runs {heldSeconds.toFixed(1)} s past the end of a
							clip there, so that clip holds its edge frame. Use “Start on cut”
							or “End on cut” to avoid it.
						</p>
					)}

					<Button disabled={!cut} onClick={applySelected}>
						{existing ? "Update selected cut" : "Apply to selected cut"}
					</Button>
					<Button
						variant="outline"
						className="bg-accent"
						disabled={!selection}
						onClick={applyAll}
					>
						Apply to all cuts on track
					</Button>
					{existing && cut && (
						<Button
							variant="ghost"
							onClick={() => {
								editor.timeline.updateElements({
									updates: [applyToCut({ target: cut, value: undefined })],
								});
								toast.success("Transition removed");
							}}
						>
							Remove from selected cut
						</Button>
					)}
				</section>
			</div>
		</PanelView>
	);
}

/**
 * Seconds the transition reaches past the edge of a clip at this cut.
 * Clips here are trimmed exactly at the cut, so any reach past the cut is
 * shown with a held frame (SRS WS-19).
 */
function holdNeeded({
	cut,
	transition,
}: {
	cut: Cut;
	transition: ClipTransition;
}): number {
	const before =
		transition.alignment === "start"
			? 0
			: transition.alignment === "end"
				? 1
				: 0.5;
	const fromSeconds = cut.from.duration / TICKS_PER_SECOND;
	const toSeconds = cut.to.duration / TICKS_PER_SECOND;
	const length = Math.min(
		transition.duration,
		before > 0 ? fromSeconds / before : Number.POSITIVE_INFINITY,
		before < 1 ? toSeconds / (1 - before) : Number.POSITIVE_INFINITY,
	);
	return Math.max(length * (1 - before), length * before);
}

function SelectRow<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
}) {
	return (
		<label className="grid grid-cols-[64px_1fr] items-center gap-2 text-xs">
			{label}
			<select
				value={value}
				onChange={(event) => {
					const picked = options.find(
						(option) => option.value === event.target.value,
					);
					if (picked) onChange(picked.value);
				}}
				className="bg-input h-8 rounded-md border px-2 text-xs"
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);
}
