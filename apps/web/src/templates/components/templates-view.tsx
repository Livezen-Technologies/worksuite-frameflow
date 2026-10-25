"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Images, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { loadFonts } from "@/fonts/google-fonts";
import { cn } from "@/utils/ui";
import { applyTemplate } from "../apply-template";
import {
	PROJECT_TEMPLATE_FONTS,
	PROJECT_TEMPLATES,
	type ProjectTemplate,
	TEMPLATE_CATEGORIES,
	type TemplateCategory,
	templateDuration,
	templateSlots,
} from "../project-templates";
import { parseProjectTemplate, usePackItems } from "@/asset-library/pack-items";

type Filter = "All" | TemplateCategory;

/** Looping card preview: slides cross-fade and the title floats in. */
export const PREVIEW_CSS = `
@keyframes ff-tpl-slide { 0%, 30% { opacity: 1; transform: scale(1); } 33%, 97% { opacity: 0; transform: scale(1.08); } 100% { opacity: 1; } }
@keyframes ff-tpl-title { 0%, 8% { opacity: 0; transform: translateY(30%); } 18%, 85% { opacity: 1; transform: none; } 100% { opacity: 0; } }
`;

export function TemplateCard({
	template,
	selected,
	onSelect,
}: {
	template: ProjectTemplate;
	selected: boolean;
	onSelect: () => void;
}) {
	const [a, b] = template.palette;
	const title = template.layers.find((l) => l.kind === "text");
	const slides = template.layers.filter((l) => l.kind === "media");
	const colors = slides.length > 0 ? slides.map((s) => s.color) : [a];
	const { width, height } = template.aspect;

	return (
		<button
			type="button"
			onClick={onSelect}
			data-template-card={template.id}
			aria-pressed={selected}
			className="group flex min-w-0 flex-col gap-1.5 text-left"
		>
			<span
				className={cn(
					"relative flex h-36 w-full items-center justify-center overflow-hidden rounded-xl bg-[#0b0d12]",
					selected
						? "ring-2 ring-[#22D3EE] ring-offset-2 ring-offset-background"
						: "ring-1 ring-white/5 group-hover:ring-white/20",
				)}
			>
				<span
					className="relative overflow-hidden rounded-md shadow-lg"
					style={{
						aspectRatio: `${width} / ${height}`,
						height: height >= width ? "100%" : undefined,
						width: height >= width ? undefined : "100%",
						background: `linear-gradient(135deg, ${a}, ${b})`,
					}}
				>
					{colors.map((color, i) => (
						<span
							key={`${color}-${i}`}
							className="absolute inset-0"
							style={{
								background: `radial-gradient(circle at 30% 30%, ${b}55, transparent 60%), ${color}`,
								animation: `ff-tpl-slide ${colors.length * 1.6}s ${i * 1.6}s infinite both`,
								opacity: i === 0 ? 1 : 0,
							}}
						/>
					))}
					{title?.kind === "text" && (
						<span
							className="absolute inset-x-1 top-1/2 -translate-y-1/2 text-center font-bold leading-tight text-white drop-shadow"
							style={{
								fontFamily: `"${String(title.style.fontFamily ?? "Inter")}", "Noto Sans Sinhala", sans-serif`,
								fontSize: height > width ? 9 : 12,
								animation: "ff-tpl-title 3.2s infinite",
								whiteSpace: "pre-line",
							}}
						>
							{title.content}
						</span>
					)}
				</span>
				<span className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
					{template.aspect.label}
				</span>
				<span className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white tabular-nums">
					{templateDuration(template).toFixed(0)}s
				</span>
			</span>
			<span className="text-foreground/90 truncate text-xs">
				{template.name}
			</span>
		</button>
	);
}

/** Video templates: pick one, it's built from your media (Templates sidebar). */
export function TemplatesView() {
	const editor = useEditor();
	const media = useEditor((e) => e.media.getAssets());
	const project = useEditor((e) => e.project.getActiveOrNull());
	const [filter, setFilter] = useState<Filter>("All");
	const [query, setQuery] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [matchShape, setMatchShape] = useState(true);
	const [busy, setBusy] = useState(false);
	const downloaded = usePackItems({ types: ["video-templates"], parse: parseProjectTemplate });
	const templates = useMemo(() => [...PROJECT_TEMPLATES, ...downloaded.map((d) => d.value)], [downloaded]);

	useEffect(() => {
		loadFonts({ families: PROJECT_TEMPLATE_FONTS }).catch(() => {});
	}, []);

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return templates.filter(
			(t) =>
				(filter === "All" || t.category === filter) &&
				(!q ||
					t.name.toLowerCase().includes(q) ||
					t.description.toLowerCase().includes(q)),
		);
	}, [filter, query, templates]);

	const selected = templates.find((t) => t.id === selectedId) ?? null;
	const visualMedia = media.filter(
		(m) => m.type === "image" || m.type === "video",
	);
	const canvas = project?.settings.canvasSize;
	const shapeDiffers =
		!!selected &&
		!!canvas &&
		Math.abs(
			canvas.width / canvas.height -
				selected.aspect.width / selected.aspect.height,
		) > 0.01;

	const use = async () => {
		if (!selected || !project) return;
		setBusy(true);
		try {
			if (shapeDiffers && matchShape) {
				await editor.project.updateSettings({
					settings: {
						canvasSize: {
							width: selected.aspect.width,
							height: selected.aspect.height,
						},
						canvasSizeMode: "preset",
					},
				});
			}
			await loadFonts({ families: PROJECT_TEMPLATE_FONTS }).catch(() => {});
			applyTemplate({
				editor,
				template: selected,
				media: visualMedia,
				at: editor.playback.getCurrentTime(),
			});
			const slots = templateSlots(selected);
			toast.success(
				slots > 0 && visualMedia.length === 0
					? `Added “${selected.name}”. Import photos or videos and use it again to fill the coloured slots.`
					: `Added “${selected.name}” at the playhead.`,
			);
		} finally {
			setBusy(false);
		}
	};

	const filters: Filter[] = ["All", ...TEMPLATE_CATEGORIES];

	return (
		<PanelView title="Templates">
			<style>{PREVIEW_CSS}</style>
			<div className="flex flex-col gap-2" data-templates-view>
				<Input
					placeholder="Search templates"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="h-8"
				/>
				<div className="flex flex-wrap gap-1">
					{filters.map((f) => (
						<button
							key={f}
							type="button"
							onClick={() => setFilter(f)}
							className={cn(
								"rounded-full border px-2 py-0.5 text-[11px]",
								filter === f
									? "bg-primary text-primary-foreground border-primary"
									: "text-muted-foreground hover:bg-accent",
							)}
						>
							{f}
						</button>
					))}
				</div>

				{selected && (
					<div
						className="bg-accent/40 flex flex-col gap-2 rounded-xl border p-3"
						data-template-detail
					>
						<div className="flex items-center justify-between gap-2">
							<span className="text-sm font-semibold">{selected.name}</span>
							<span className="text-muted-foreground text-[11px]">
								{selected.aspect.label}
							</span>
						</div>
						<p className="text-muted-foreground text-xs">
							{selected.description}
						</p>
						<div className="text-muted-foreground flex flex-wrap gap-3 text-[11px]">
							<span className="flex items-center gap-1">
								<Clock className="size-3" />{" "}
								{templateDuration(selected).toFixed(1)} s
							</span>
							<span className="flex items-center gap-1">
								<Images className="size-3" />
								{templateSlots(selected) === 0
									? "No media needed"
									: `Uses ${templateSlots(selected)} of your photos or videos (${visualMedia.length} imported)`}
							</span>
						</div>
						{shapeDiffers && (
							<label className="flex items-center gap-2 text-xs">
								<input
									type="checkbox"
									className="accent-primary size-3.5"
									checked={matchShape}
									onChange={(e) => setMatchShape(e.target.checked)}
								/>
								Change the project to {selected.aspect.label} (
								{selected.aspect.width} × {selected.aspect.height})
							</label>
						)}
						<Button size="sm" disabled={busy} onClick={() => void use()}>
							<Sparkles />
							Use template
						</Button>
					</div>
				)}

				<div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-2.5 gap-y-3">
					{visible.map((template) => (
						<TemplateCard
							key={template.id}
							template={template}
							selected={template.id === selectedId}
							onSelect={() => setSelectedId(template.id)}
						/>
					))}
					{visible.length === 0 && (
						<p className="text-muted-foreground col-span-2 py-6 text-center text-xs">
							No templates match.
						</p>
					)}
				</div>
			</div>
		</PanelView>
	);
}
