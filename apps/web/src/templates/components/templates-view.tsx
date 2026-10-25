"use client";

import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Clock, CloudDownload, FilePlus2, Images, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { useAssetLibrary } from "@/asset-library/store";
import { useT } from "@/i18n";
import { useStartIntent } from "@/start/intent";
import { useMyProjectTemplates } from "../my-templates";
import { filterTemplates, type TemplateSection, templateSection } from "../save-template";
import { TemplateLiveCanvas } from "./online-template-card";
import { useSaveTemplateDialog } from "./save-template-dialog";

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
	badge,
}: {
	template: ProjectTemplate;
	selected: boolean;
	onSelect: () => void;
	/** Pack name (Downloaded) or "Mine". */
	badge?: string;
}) {
	const [hover, setHover] = useState(false);
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
			title={template.name}
			onPointerEnter={() => setHover(true)}
			onPointerLeave={() => setHover(false)}
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
				{template.thumbnail ? (
					// eslint-disable-next-line @next/next/no-img-element -- a saved template's still (data URL)
					<img src={template.thumbnail} alt="" className="size-full object-contain" />
				) : template.preview ? (
					<TemplateLiveCanvas template={template} playing={hover} width={180} height={144} />
				) : (
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
				)}
				{badge && (
					<span className="absolute top-1.5 right-1.5 max-w-[60%] truncate rounded bg-[#22D3EE]/90 px-1.5 py-0.5 text-[10px] font-semibold text-black" data-template-badge>
						{badge}
					</span>
				)}
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

const SECTIONS: Array<[TemplateSection, string]> = [
	["built-in", "Built-in"],
	["downloaded", "Downloaded"],
	["mine", "My templates"],
];

/**
 * Video templates (Templates sidebar): Built-in, Downloaded (from Asset
 * Library packs) and My templates (saved from projects). Pick one and it's
 * built from your media at the playhead, or opens in a new project.
 */
export function TemplatesView() {
	const t = useT();
	const editor = useEditor();
	const router = useRouter();
	const media = useEditor((e) => e.media.getAssets());
	const project = useEditor((e) => e.project.getActiveOrNull());
	const [section, setSection] = useState<TemplateSection>("built-in");
	const [filter, setFilter] = useState<Filter>("All");
	const [query, setQuery] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [matchShape, setMatchShape] = useState(true);
	const [busy, setBusy] = useState(false);
	const [renaming, setRenaming] = useState<string | null>(null);
	const downloaded = usePackItems({ types: ["video-templates"], parse: parseProjectTemplate });
	const mine = useMyProjectTemplates((s) => s.templates);
	const renameMine = useMyProjectTemplates((s) => s.rename);
	const removeMine = useMyProjectTemplates((s) => s.remove);
	const templates = useMemo(() => [...PROJECT_TEMPLATES, ...downloaded.map((d) => d.value), ...mine], [downloaded, mine]);

	useEffect(() => {
		loadFonts({ families: PROJECT_TEMPLATE_FONTS }).catch(() => {});
	}, []);

	const counts = useMemo(
		() => Object.fromEntries(SECTIONS.map(([id]) => [id, templates.filter((x) => templateSection(x) === id).length])) as Record<TemplateSection, number>,
		[templates],
	);
	const visible = useMemo(() => filterTemplates({ templates, section, category: filter, query }), [templates, section, filter, query]);

	const selected = templates.find((x) => x.id === selectedId) ?? null;
	const visualMedia = media.filter((m) => m.type === "image" || m.type === "video");
	const canvas = project?.settings.canvasSize;
	const shapeDiffers = !!selected && !!canvas && Math.abs(canvas.width / canvas.height - selected.aspect.width / selected.aspect.height) > 0.01;

	const use = async () => {
		if (!selected || !project) return;
		setBusy(true);
		try {
			if (shapeDiffers && matchShape) {
				await editor.project.updateSettings({
					settings: { canvasSize: { width: selected.aspect.width, height: selected.aspect.height }, canvasSizeMode: "preset" },
				});
			}
			await loadFonts({ families: PROJECT_TEMPLATE_FONTS }).catch(() => {});
			applyTemplate({ editor, template: selected, media: visualMedia, at: editor.playback.getCurrentTime() });
			const slots = templateSlots(selected);
			toast.success(
				slots > 0 && visualMedia.length === 0
					? t("Added “{name}”. Import photos or videos and use it again to fill the coloured slots.", { name: selected.name })
					: t("Added “{name}” at the playhead.", { name: selected.name }),
			);
		} catch (error) {
			toast.error(t("Couldn't add the template"), { description: error instanceof Error ? error.message : String(error) });
		} finally {
			setBusy(false);
		}
	};

	/** A new project of the template's size, built from it (as Start › Templates does). */
	const useInNewProject = async () => {
		if (!selected) return;
		setBusy(true);
		try {
			const projectId = await editor.project.createNewProject({
				name: selected.name,
				settings: { canvasSize: { width: selected.aspect.width, height: selected.aspect.height }, canvasSizeMode: "preset" },
			});
			useStartIntent.getState().set({ projectId, intent: { kind: "template", template: selected } });
			router.push(`/editor/${projectId}`);
		} catch (error) {
			toast.error(t("Couldn't create the project"), { description: error instanceof Error ? error.message : String(error) });
		} finally {
			setBusy(false);
		}
	};

	const filters: Filter[] = ["All", ...TEMPLATE_CATEGORIES];
	const badgeOf = (x: ProjectTemplate) => (x.source?.kind === "pack" ? x.source.packTitle : x.source?.kind === "user" ? t("Mine") : undefined);

	return (
		<PanelView title={t("Templates")}>
			<style>{PREVIEW_CSS}</style>
			<div className="flex flex-col gap-2" data-templates-view>
				<div className="bg-muted/60 flex rounded-lg p-0.5" role="tablist" aria-label={t("Templates")}>
					{SECTIONS.map(([id, label]) => (
						<button
							key={id}
							type="button"
							role="tab"
							aria-selected={section === id}
							onClick={() => {
								setSection(id);
								setSelectedId(null);
							}}
							className={cn("flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition", section === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
							data-template-section={id}
						>
							{t(label)} <span className="text-muted-foreground tabular-nums">{counts[id]}</span>
						</button>
					))}
				</div>
				<Input placeholder={t("Search templates")} value={query} onChange={(e) => setQuery(e.target.value)} className="h-8" />
				<div className="flex flex-wrap gap-1">
					{filters.map((f) => (
						<button
							key={f}
							type="button"
							onClick={() => setFilter(f)}
							className={cn("rounded-full border px-2 py-0.5 text-[11px]", filter === f ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-accent")}
						>
							{t(f)}
						</button>
					))}
				</div>
				<Button size="sm" variant="outline" className="h-8 text-xs" disabled={!project} onClick={() => useSaveTemplateDialog.getState().setOpen(true)} data-save-template-open>
					<BookmarkPlus /> {t("Save current project as template")}
				</Button>

				{selected && (
					<div className="bg-accent/40 flex flex-col gap-2 rounded-xl border p-3" data-template-detail>
						<div className="flex items-center justify-between gap-2">
							{renaming === selected.id ? (
								<form
									className="flex flex-1 gap-1"
									onSubmit={(e) => {
										e.preventDefault();
										const value = new FormData(e.currentTarget).get("name");
										renameMine(selected.id, String(value ?? ""));
										setRenaming(null);
									}}
								>
									<Input name="name" defaultValue={selected.name} className="h-7 text-xs" autoFocus aria-label={t("Template name")} />
									<Button size="sm" type="submit" className="h-7 px-2 text-xs">
										{t("Save")}
									</Button>
								</form>
							) : (
								<span className="text-sm font-semibold">{selected.name}</span>
							)}
							<span className="text-muted-foreground text-[11px]">{selected.aspect.label}</span>
						</div>
						{selected.source?.kind === "pack" && <span className="text-muted-foreground text-[11px]">{t("From {pack}", { pack: selected.source.packTitle })}</span>}
						{selected.description && <p className="text-muted-foreground text-xs">{selected.description}</p>}
						<div className="text-muted-foreground flex flex-wrap gap-3 text-[11px]">
							<span className="flex items-center gap-1">
								<Clock className="size-3" /> {templateDuration(selected).toFixed(1)} s
							</span>
							<span className="flex items-center gap-1">
								<Images className="size-3" />
								{templateSlots(selected) === 0
									? t("No media needed")
									: t("Uses {count} of your photos or videos ({imported} imported)", { count: templateSlots(selected), imported: visualMedia.length })}
							</span>
						</div>
						{shapeDiffers && (
							<label className="flex items-center gap-2 text-xs">
								<input type="checkbox" className="accent-primary size-3.5" checked={matchShape} onChange={(e) => setMatchShape(e.target.checked)} />
								{t("Change the project to {aspect} ({width} × {height})", { aspect: selected.aspect.label, width: selected.aspect.width, height: selected.aspect.height })}
							</label>
						)}
						<Button size="sm" disabled={busy || !project} onClick={() => void use()} data-template-use>
							<Sparkles />
							{t("Use template")}
						</Button>
						<Button size="sm" variant="secondary" disabled={busy} onClick={() => void useInNewProject()} data-template-new-project>
							<FilePlus2 />
							{t("Use in a new project")}
						</Button>
						{selected.source?.kind === "user" && (
							<div className="flex gap-2">
								<Button size="sm" variant="ghost" className="h-7 flex-1 text-xs" onClick={() => setRenaming(selected.id)}>
									<Pencil /> {t("Rename")}
								</Button>
								<Button
									size="sm"
									variant="ghost"
									className="h-7 flex-1 text-xs text-red-400"
									onClick={() => {
										removeMine(selected.id);
										setSelectedId(null);
										toast.success(t("Deleted “{name}”", { name: selected.name }));
									}}
								>
									<Trash2 /> {t("Delete")}
								</Button>
							</div>
						)}
					</div>
				)}

				<div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-2.5 gap-y-3" data-template-grid={section}>
					{visible.map((template) => (
						<TemplateCard key={template.id} template={template} badge={badgeOf(template)} selected={template.id === selectedId} onSelect={() => setSelectedId(template.id)} />
					))}
					{visible.length === 0 && (
						<div className="text-muted-foreground col-span-full flex flex-col items-center gap-2 py-6 text-center text-xs" data-template-empty={section}>
							{section === "downloaded" && counts.downloaded === 0 ? (
								<>
									<p>{t("No downloaded templates yet. Get video template packs from the Asset Library.")}</p>
									<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => useAssetLibrary.getState().setOpen(true, "video-templates")}>
										<CloudDownload /> {t("Open Asset Library")}
									</Button>
								</>
							) : section === "mine" && counts.mine === 0 ? (
								<p>{t("Nothing saved yet. Use “Save current project as template” to keep a project's layout here.")}</p>
							) : (
								<p>{t("No templates match.")}</p>
							)}
						</div>
					)}
				</div>
			</div>
		</PanelView>
	);
}
