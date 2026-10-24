"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useEditor } from "@/editor/use-editor";
import type { ImageElement, TimelineElement, TimelineTrack, VideoElement } from "@/timeline";
import { cn } from "@/utils/ui";
import { TICKS_PER_SECOND } from "@/wasm";
import { getTransitionDefinition, TRANSITIONS } from "../definitions";
import { DEFAULT_TRANSITION, type ClipTransition, type TransitionType } from "../types";
import { findClipBefore } from "../windows";

/** Drag payload for a transition dragged from the Transitions panel. */
export const TRANSITION_DRAG_TYPE = "application/x-frameflow-transition";

export const MIN_TRANSITION_SECONDS = 0.1;
export const MAX_TRANSITION_SECONDS = 5;

type Clip = VideoElement | ImageElement;
const isClip = (e: TimelineElement): e is Clip => e.type === "video" || e.type === "image";

/** The clip after `clip` on its track that starts exactly where it ends. */
function clipAfter({ track, clip }: { track: TimelineTrack; clip: Clip }): Clip | null {
	const clips = track.elements.filter(isClip);
	return clips.find((other) => findClipBefore({ clips: [clip], clip: other, ticksPerSecond: TICKS_PER_SECOND })) ?? null;
}

function clipBefore({ track, clip }: { track: TimelineTrack; clip: Clip }): Clip | null {
	return findClipBefore({ clips: track.elements.filter(isClip), clip, ticksPerSecond: TICKS_PER_SECOND });
}

const ticksToSeconds = (t: number) => t / TICKS_PER_SECOND;

/** Longest transition the two clips around a cut can hold. */
export function maxTransitionFor({ from, to }: { from: Clip; to: Clip }): number {
	return Math.max(MIN_TRANSITION_SECONDS, Math.min(MAX_TRANSITION_SECONDS, ticksToSeconds(from.duration), ticksToSeconds(to.duration)));
}

const isTransitionType = (v: unknown): v is TransitionType => typeof v === "string" && TRANSITIONS.some((t) => t.type === v);

function readPayload(data: DataTransfer): ClipTransition | null {
	try {
		const parsed: unknown = JSON.parse(data.getData(TRANSITION_DRAG_TYPE));
		if (!parsed || typeof parsed !== "object" || !("type" in parsed) || !isTransitionType(parsed.type)) return null;
		const get = (key: string): unknown => (key in parsed ? Reflect.get(parsed, key) : undefined);
		const duration = get("duration");
		const easing = get("easing");
		const direction = get("direction");
		const alignment = get("alignment");
		return {
			type: parsed.type,
			duration: typeof duration === "number" && Number.isFinite(duration) ? duration : DEFAULT_TRANSITION.duration,
			easing: easing === "linear" || easing === "ease-in" || easing === "ease-out" || easing === "ease-in-out" ? easing : DEFAULT_TRANSITION.easing,
			direction: direction === "left" || direction === "right" || direction === "up" || direction === "down" ? direction : DEFAULT_TRANSITION.direction,
			alignment: alignment === "center" || alignment === "start" || alignment === "end" ? alignment : DEFAULT_TRANSITION.alignment,
		};
	} catch {
		return null;
	}
}

/**
 * Dropping a transition on a clip puts it on the nearer cut: the cut into
 * this clip (left half) or out of it (right half). Returns drag handlers and
 * which edge is highlighted.
 */
export function useTransitionDrop({ element, track }: { element: TimelineElement; track: TimelineTrack }) {
	const editor = useEditor();
	const [edge, setEdge] = useState<"left" | "right" | null>(null);
	if (!isClip(element)) return { edge: null, handlers: {} };
	const targetFor = (side: "left" | "right") => {
		if (side === "left") {
			const from = clipBefore({ track, clip: element });
			return from ? { from, to: element } : null;
		}
		const to = clipAfter({ track, clip: element });
		return to ? { from: element, to } : null;
	};
	const sideOf = (e: React.DragEvent) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const preferred = e.clientX - rect.left < rect.width / 2 ? "left" : "right";
		if (targetFor(preferred)) return preferred;
		const other = preferred === "left" ? "right" : "left";
		return targetFor(other) ? other : null;
	};
	const ours = (e: React.DragEvent) => e.dataTransfer.types.includes(TRANSITION_DRAG_TYPE);
	return {
		edge,
		handlers: {
			onDragOver: (e: React.DragEvent) => {
				if (!ours(e)) return;
				const side = sideOf(e);
				if (!side) return;
				e.preventDefault();
				e.stopPropagation();
				e.dataTransfer.dropEffect = "copy";
				if (side !== edge) setEdge(side);
			},
			onDragLeave: () => setEdge(null),
			onDrop: (e: React.DragEvent) => {
				if (!ours(e)) return;
				const side = sideOf(e);
				setEdge(null);
				const payload = readPayload(e.dataTransfer);
				const target = side ? targetFor(side) : null;
				if (!payload || !target) return;
				e.preventDefault();
				e.stopPropagation();
				const max = maxTransitionFor(target);
				const transition: ClipTransition = { ...payload, duration: Math.min(max, payload.duration) };
				editor.timeline.updateElements({ updates: [{ trackId: track.id, elementId: target.to.id, patch: { transitionIn: transition } }] });
				editor.selection.setSelectedElements({ elements: [{ trackId: track.id, elementId: target.to.id }] });
				useAssetsPanelStore.getState().setActiveTab("transitions");
			},
		},
	};
}

/**
 * The transition into a clip, drawn across its cut. Drag either end to
 * change its length (live, one undo step); click to edit it in the
 * Transitions panel; × removes it.
 */
export function TransitionBar({ element, track, pixelsPerSecond }: { element: TimelineElement; track: TimelineTrack; pixelsPerSecond: number }) {
	const editor = useEditor();
	const drag = useRef<{ startX: number; start: ClipTransition; side: "left" | "right"; max: number } | null>(null);
	const [dragging, setDragging] = useState(false);
	if (!isClip(element) || !element.transitionIn) return null;
	const transition = element.transitionIn;
	const width = Math.max(10, transition.duration * pixelsPerSecond);
	// The bar sits inside the incoming clip, whose left edge is the cut.
	const left = transition.alignment === "start" ? 0 : transition.alignment === "end" ? -width : -width / 2;
	const name = getTransitionDefinition(transition.type).name;

	const onDown = ({ e, side }: { e: React.PointerEvent; side: "left" | "right" }) => {
		e.stopPropagation();
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		const from = clipBefore({ track, clip: element });
		drag.current = { startX: e.clientX, start: transition, side, max: from ? maxTransitionFor({ from, to: element }) : MAX_TRANSITION_SECONDS };
		setDragging(true);
		// Show the cut in the preview so the length change is visible while dragging.
		editor.playback.seek({ time: element.startTime });
	};
	const onMove = (e: React.PointerEvent) => {
		const d = drag.current;
		if (!d) return;
		const dx = (e.clientX - d.startX) / pixelsPerSecond;
		// Centred bars grow on both sides; edge-aligned ones grow on one.
		const grow = d.start.alignment === "center" ? 2 * (d.side === "right" ? dx : -dx) : d.side === "right" ? dx : -dx;
		const duration = Math.round(Math.min(d.max, Math.max(MIN_TRANSITION_SECONDS, d.start.duration + grow)) * 20) / 20;
		editor.timeline.previewElements({
			updates: [{ trackId: track.id, elementId: element.id, updates: { transitionIn: { ...d.start, duration } } }],
		});
	};
	const onUp = () => {
		if (!drag.current) return;
		drag.current = null;
		setDragging(false);
		editor.timeline.commitPreview();
	};
	const select = (e: { stopPropagation: () => void }) => {
		e.stopPropagation();
		editor.selection.setSelectedElements({ elements: [{ trackId: track.id, elementId: element.id }] });
		useAssetsPanelStore.getState().setActiveTab("transitions");
	};

	const handle = "absolute top-0 bottom-0 z-10 w-2 cursor-ew-resize bg-white/80 opacity-0 transition-opacity group-hover/transition:opacity-100";
	return (
		<div
			className={cn(
				"group/transition absolute top-1 bottom-1 z-20 flex items-center justify-center overflow-visible border border-white/40 bg-gradient-to-r from-[#F59E0B]/70 via-[#F59E0B]/90 to-[#F59E0B]/70 text-[10px] font-semibold text-black shadow-md",
				dragging && "ring-2 ring-white",
			)}
			style={{ left, width, transition: dragging ? "none" : "width 120ms ease-out, left 120ms ease-out" }}
			title={`${name}, ${transition.duration.toFixed(2)} s. Drag the ends to change the length; click to edit.`}
			data-transition-bar={element.id}
			role="button"
			tabIndex={0}
			aria-label={`${name} transition, ${transition.duration.toFixed(2)} seconds`}
			onClick={select}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") select(e);
			}}
			onMouseDown={(e) => e.stopPropagation()}
			onPointerMove={onMove}
			onPointerUp={onUp}
		>
			<span className="pointer-events-none truncate px-1">{width > 70 ? name : "⇄"}</span>
			{dragging && (
				<span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 bg-black px-1.5 py-0.5 text-[10px] text-white" data-transition-duration-tip>
					{transition.duration.toFixed(2)} s
				</span>
			)}
			<span className={cn(handle, "left-0")} onPointerDown={(e) => onDown({ e, side: "left" })} data-transition-handle="left" />
			<span className={cn(handle, "right-0")} onPointerDown={(e) => onDown({ e, side: "right" })} data-transition-handle="right" />
			<button
				type="button"
				aria-label="Remove transition"
				className="absolute -top-2 -right-2 hidden size-4 items-center justify-center bg-black text-white group-hover/transition:flex"
				onClick={(e) => {
					e.stopPropagation();
					editor.timeline.updateElements({ updates: [{ trackId: track.id, elementId: element.id, patch: { transitionIn: undefined } }] });
				}}
			>
				<X className="size-3" />
			</button>
		</div>
	);
}

/** Glow on the cut a dragged transition would land on. */
export function TransitionDropMarker({ edge }: { edge: "left" | "right" | null }) {
	if (!edge) return null;
	return (
		<div
			className={cn("pointer-events-none absolute top-0 bottom-0 z-30 w-1.5 bg-[#F59E0B] shadow-[0_0_12px_4px_rgba(245,158,11,0.7)]", edge === "left" ? "-left-1" : "-right-1")}
			data-transition-drop-marker={edge}
		/>
	);
}
