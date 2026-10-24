"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { renderAnimatedText } from "@/text-animation/render";
import type { TextAnimationStyle } from "@/text-animation/types";
import type { LibraryEntry, TextLibraryContent } from "../library-content";
import { localName, searchItems, type TextLibraryAnimation, type TextLibraryItem, type TextLibraryTemplate } from "../manifest";
import { aspectBox, drawTemplateFrame } from "../template-render";
import { PreviewCanvas } from "./text-preview-canvas";

export type LibraryTab = "animations" | "templates";

export interface TextLibraryPanelProps {
	content: TextLibraryContent | null;
	error?: string | null;
	lang?: string;
	favourites: string[];
	recent: string[];
	previewText: string;
	onPreviewTextChange: (text: string) => void;
	onToggleFavourite: (key: string) => void;
	/** Double-click / Enter: add at the playhead. */
	onAdd: (item: LibraryEntry, text: string) => void;
	/** Apply an animation to the selected text clips (shown when `selectedTextCount` > 0). */
	onApply?: (item: LibraryEntry<TextLibraryAnimation>) => void;
	selectedTextCount?: number;
	onDragStart?: (event: DragEvent, item: LibraryEntry, text: string) => void;
	onDragEnd?: () => void;
	/** Export a template as Lottie JSON / dotLottie. */
	onExportTemplate?: (item: LibraryEntry<TextLibraryTemplate>, format: "json" | "lottie") => void;
	initialTab?: LibraryTab;
}

export const itemKey = (item: Pick<TextLibraryItem, "kind" | "id">) => `${item.kind}:${item.id}`;

const TILE_W = 148;
const TILE_H = 84;
const ROW_H = TILE_H + 30;
const COLS = 2;

const PREVIEW_STYLE: Partial<TextAnimationStyle> = { fontSize: 20 };

/** A template in its own aspect (9:16 and 1:1 are letterboxed in the 16:9 tile). */
function drawTemplateTile(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, template: TextLibraryTemplate, t: number, lang: string, text: string) {
	const box = aspectBox(template.aspect, TILE_W, TILE_H);
	ctx.save();
	if (box.width < TILE_W || box.height < TILE_H) {
		ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
		ctx.fillRect(box.x, box.y, box.width, box.height);
	}
	ctx.translate(box.x, box.y);
	drawTemplateFrame({ ctx, template, width: box.width, height: box.height, time: t, lang, override: text });
	ctx.restore();
}

function Tile({
	item,
	text,
	lang,
	favourite,
	onToggleFavourite,
	onAdd,
	onApply,
	canApply,
	onDragStart,
	onDragEnd,
	onExport,
}: {
	item: LibraryEntry;
	text: string;
	lang: string;
	favourite: boolean;
	onToggleFavourite: () => void;
	onAdd: () => void;
	onApply?: () => void;
	canApply: boolean;
	onDragStart?: (e: DragEvent) => void;
	onDragEnd?: () => void;
	onExport?: (format: "json" | "lottie") => void;
}) {
	const [hover, setHover] = useState(false);
	const name = localName(item.name, lang);
	const shown = text.trim() || (item.kind === "animation" ? (item.previewText ? localName(item.previewText, lang) : name) : "");
	const duration = item.kind === "template" ? item.duration : (item.duration ?? 3);
	const draw =
		item.kind === "animation"
			? (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: number) =>
					renderAnimatedText({ ctx, text: shown, animation: item.animation, time: t, duration, x: TILE_W / 2, y: TILE_H / 2, style: { fontFamily: "Inter, Noto Sans Sinhala, Noto Sans Tamil", fontWeight: 700, tracking: 0, lineHeight: 1.15, align: "center", fill: "#FFFFFF", ...item.style, ...PREVIEW_STYLE, fontSize: 20, maxWidth: TILE_W * 0.9 } })
			: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: number) =>
					drawTemplateTile(ctx, item as TextLibraryTemplate, t, lang, text);
	return (
		<div className="flex flex-col gap-1" data-text-library-item={item.id} style={{ width: TILE_W }}>
			<button
				type="button"
				title={`${name} — double-click to add, drag onto the timeline or a text clip`}
				draggable={!!onDragStart}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onDoubleClick={onAdd}
				onKeyDown={(e) => e.key === "Enter" && onAdd()}
				onPointerEnter={() => setHover(true)}
				onPointerLeave={() => setHover(false)}
				onFocus={() => setHover(true)}
				onBlur={() => setHover(false)}
				className="relative overflow-hidden rounded-md border border-white/10 bg-[radial-gradient(circle_at_30%_20%,#2b3046,#0f1118)] hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary"
				style={{ width: TILE_W, height: TILE_H, padding: 0 }}
			>
				<PreviewCanvas draw={draw} drawKey={`${item.packId}/${item.id}|${shown}|${lang}`} duration={duration} width={TILE_W} height={TILE_H} playing={hover} />
				{item.plan === "pro" && <span className="absolute left-1 top-1 rounded bg-amber-500 px-1 text-[9px] font-semibold text-black">PRO</span>}
			</button>
			<div className="flex items-center gap-1">
				<span className="min-w-0 flex-1 truncate text-[11px]" title={name}>
					{name}
				</span>
				{onExport && (
					<button type="button" title="Export as dotLottie (hold Shift for Lottie JSON)" className="text-muted-foreground text-[10px] hover:underline" onClick={(e) => onExport(e.shiftKey ? "json" : "lottie")}>
						Export
					</button>
				)}
				{canApply && onApply && (
					<button type="button" className="text-primary text-[10px] hover:underline" onClick={onApply}>
						Apply
					</button>
				)}
				<button
					type="button"
					aria-label={favourite ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
					aria-pressed={favourite}
					onClick={onToggleFavourite}
					className={favourite ? "text-amber-400" : "text-muted-foreground hover:text-foreground"}
				>
					{favourite ? "★" : "☆"}
				</button>
			</div>
		</div>
	);
}

/** Virtualised grid: only rows near the viewport are mounted. */
function VirtualGrid<T>({ items, render, height }: { items: T[]; render: (item: T) => ReactNode; height?: number }) {
	const ref = useRef<HTMLDivElement>(null);
	const [scroll, setScroll] = useState(0);
	const [view, setView] = useState(height ?? 480);
	useEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const ro = new ResizeObserver(() => setView(el.clientHeight || 480));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const rows = Math.ceil(items.length / COLS);
	const first = Math.max(0, Math.floor(scroll / ROW_H) - 2);
	const last = Math.min(rows, Math.ceil((scroll + view) / ROW_H) + 2);
	const visible: ReactNode[] = [];
	for (let r = first; r < last; r++)
		visible.push(
			<div key={r} className="absolute left-0 right-0 flex gap-2" style={{ top: r * ROW_H }}>
				{items.slice(r * COLS, r * COLS + COLS).map(render)}
			</div>,
		);
	return (
		<div ref={ref} className="relative min-h-0 flex-1 overflow-y-auto" onScroll={(e) => setScroll(e.currentTarget.scrollTop)} data-virtual-rows={last - first}>
			<div style={{ height: rows * ROW_H, position: "relative" }}>{visible}</div>
		</div>
	);
}

/**
 * The Text library: animations and templates by category, searchable in
 * English, Sinhala and Tamil, with favourites, recently used and live
 * previews drawn by the text animation engine.
 */
export function TextLibraryPanel(props: TextLibraryPanelProps) {
	const { content, lang = "en", favourites, recent, previewText } = props;
	const [tab, setTab] = useState<LibraryTab>(props.initialTab ?? "animations");
	const [category, setCategory] = useState<string>("all");
	const [query, setQuery] = useState("");

	const pool: LibraryEntry[] = useMemo(() => (content ? (tab === "animations" ? content.animations : content.templates) : []), [content, tab]);
	const categories = content ? (tab === "animations" ? content.categories.animations : content.categories.templates) : [];
	const shown = useMemo(() => {
		let list = pool;
		if (category === "favourites") list = pool.filter((i) => favourites.includes(itemKey(i)));
		else if (category === "recent") list = recent.map((k) => pool.find((i) => itemKey(i) === k)).filter((i): i is LibraryEntry => !!i);
		else if (category !== "all") list = pool.filter((i) => i.category === category);
		return searchItems(list, query);
	}, [pool, category, query, favourites, recent]);

	const chips: Array<{ id: string; label: string }> = [
		{ id: "all", label: "All" },
		{ id: "favourites", label: "★ Favourites" },
		{ id: "recent", label: "Recent" },
		...categories.map((c) => ({ id: c.id, label: localName(c.name, lang) })),
	];

	return (
		<div className="flex h-full min-h-0 flex-col gap-2 p-2" data-text-library>
			<div className="flex gap-4 border-b border-white/10" role="tablist">
				{(["animations", "templates"] as const).map((t) => (
					<button
						key={t}
						type="button"
						role="tab"
						aria-selected={tab === t}
						onClick={() => {
							setTab(t);
							setCategory("all");
						}}
						className={`-mb-px border-b-2 pb-1.5 text-sm ${tab === t ? "border-primary text-foreground" : "text-muted-foreground border-transparent"}`}
					>
						{t === "animations" ? "Animations" : "Templates"}
						<span className="text-muted-foreground ml-1 text-[10px]">{content ? (t === "animations" ? content.animations.length : content.templates.length) : ""}</span>
					</button>
				))}
			</div>
			<input
				type="search"
				placeholder="Search (English, සිංහල, தமிழ்)"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				className="border-input bg-background h-8 rounded-md border px-2 text-sm"
				aria-label="Search the text library"
			/>
			<label className="flex flex-col gap-1 text-[11px]">
				<span className="text-muted-foreground">Preview with:</span>
				<input
					type="text"
					placeholder="Your text"
					value={previewText}
					onChange={(e) => props.onPreviewTextChange(e.target.value)}
					className="border-input bg-background h-8 rounded-md border px-2 text-sm"
					data-text-library-preview
				/>
			</label>
			<div className="flex flex-wrap gap-1">
				{chips.map((c) => (
					<button
						key={c.id}
						type="button"
						onClick={() => setCategory(c.id)}
						aria-pressed={category === c.id}
						className={`rounded-full border px-2 py-0.5 text-[11px] ${category === c.id ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-accent border-white/15"}`}
					>
						{c.label}
					</button>
				))}
			</div>
			{props.error && <p className="text-destructive text-xs">{props.error}</p>}
			{!content && !props.error && <p className="text-muted-foreground py-6 text-center text-xs">Loading the text library…</p>}
			{content && shown.length === 0 && (
				<p className="text-muted-foreground py-6 text-center text-xs">
					{category === "favourites" ? "Star items to keep them here." : category === "recent" ? "Items you add show up here." : "Nothing matches."}
				</p>
			)}
			<VirtualGrid<LibraryEntry>
				items={shown}
				render={(item) => (
					<Tile
						key={itemKey(item)}
						item={item}
						text={previewText}
						lang={lang}
						favourite={favourites.includes(itemKey(item))}
						onToggleFavourite={() => props.onToggleFavourite(itemKey(item))}
						onAdd={() => props.onAdd(item, previewText)}
						canApply={item.kind === "animation" && (props.selectedTextCount ?? 0) > 0}
						onApply={item.kind === "animation" && props.onApply ? () => props.onApply?.(item as LibraryEntry<TextLibraryAnimation>) : undefined}
						onDragStart={props.onDragStart ? (e) => props.onDragStart?.(e, item, previewText) : undefined}
						onDragEnd={props.onDragEnd}
						onExport={item.kind === "template" && props.onExportTemplate ? (format) => props.onExportTemplate?.(item as LibraryEntry<TextLibraryTemplate>, format) : undefined}
					/>
				)}
			/>
			<p className="text-muted-foreground text-[10px]">Double-click to add at the playhead · drag onto the timeline, or onto a text or caption clip to animate it.</p>
		</div>
	);
}
