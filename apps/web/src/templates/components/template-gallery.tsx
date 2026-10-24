"use client";

import { Check, CloudDownload, Search, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AssetStoreState, CatalogPack } from "@/asset-library/types";
import { parseProjectTemplate, usePackItems } from "@/asset-library/pack-items";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { loadFonts } from "@/fonts/google-fonts";
import { formatBytes, LibraryPageShell } from "@/library/components/page-shell";
import { useStartIntent } from "@/start/intent";
import { cn } from "@/utils/ui";
import { PROJECT_TEMPLATE_FONTS, PROJECT_TEMPLATES, type ProjectTemplate, TEMPLATE_CATEGORIES, templateDuration, templateSlots } from "../project-templates";
import { PREVIEW_CSS, TemplateCard } from "./templates-view";

const ASPECT_FILTERS = [
	["all", "All sizes"],
	["16:9", "16:9 YouTube"],
	["9:16", "9:16 Reels"],
	["1:1", "1:1 Post"],
] as const;
const FROM_START: Record<string, string> = { "youtube-1080": "16:9", tiktok: "9:16", "instagram-square": "1:1" };

/** The desktop asset store's state, kept live (online template packs). */
function useAssetStore(): AssetStoreState | null {
	const [state, setState] = useState<AssetStoreState | null>(null);
	useEffect(() => {
		const bridge = window.worksuite?.assets;
		if (!bridge) return;
		void bridge.getState().then(setState).catch(() => {});
		return bridge.onChange(setState);
	}, []);
	return state;
}

/**
 * Start › Templates: every video template with a live preview, built-in and
 * from the online library. Pick one and it opens in a new project of its size.
 */
export function TemplateGallery() {
	const editor = useEditor();
	const router = useRouter();
	const params = useSearchParams();
	const [aspect, setAspect] = useState<string>(FROM_START[params.get("aspect") ?? ""] ?? "all");
	const [category, setCategory] = useState<string>("All");
	const [query, setQuery] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const downloaded = usePackItems({ types: ["video-templates"], parse: parseProjectTemplate });
	const store = useAssetStore();

	useEffect(() => {
		loadFonts({ families: PROJECT_TEMPLATE_FONTS }).catch(() => {});
	}, []);

	const templates = useMemo(() => {
		const seen = new Set<string>();
		return [...PROJECT_TEMPLATES, ...downloaded.map((d) => d.value)].filter((t) => !seen.has(t.id) && seen.add(t.id));
	}, [downloaded]);
	const q = query.trim().toLowerCase();
	const visible = templates.filter(
		(t) =>
			(aspect === "all" || t.aspect.label === aspect) &&
			(category === "All" || t.category === category) &&
			(!q || `${t.name} ${t.description} ${t.category}`.toLowerCase().includes(q)),
	);
	// Online packs of video templates not on this computer yet.
	const online: CatalogPack[] = (store?.catalog?.packs ?? []).filter(
		(p) =>
			p.type === "video-templates" &&
			!store?.installed[p.id] &&
			!store?.builtin.some((b) => b.id === p.id) &&
			(!q || `${p.title} ${p.description}`.toLowerCase().includes(q)),
	);
	const selected = templates.find((t) => t.id === selectedId) ?? null;

	const open = async (template: ProjectTemplate) => {
		setBusy(true);
		try {
			const projectId = await editor.project.createNewProject({
				name: template.name,
				settings: { canvasSize: { width: template.aspect.width, height: template.aspect.height }, canvasSizeMode: "preset" },
			});
			useStartIntent.getState().set({ projectId, intent: { kind: "template", template } });
			router.push(`/editor/${projectId}`);
		} catch (error) {
			setBusy(false);
			toast.error("Couldn't create the project", { description: error instanceof Error ? error.message : String(error) });
		}
	};

	const install = (pack: CatalogPack) => {
		void window.worksuite?.assets?.install(pack.id).catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)));
	};

	return (
		<LibraryPageShell
			title="Templates"
			subtitle="Pick a video template. It opens in a new project at the right size; swap in your photos, videos and words."
			actions={
				<Button disabled={!selected || busy} onClick={() => selected && void open(selected)} data-template-open>
					<Sparkles /> {busy ? "Opening…" : selected ? `Use “${selected.name}”` : "Select a template"}
				</Button>
			}
		>
			<style>{PREVIEW_CSS}</style>
			<div className="mx-auto flex max-w-7xl flex-col gap-5" data-template-gallery>
				<div className="flex flex-wrap items-center gap-3">
					<div className="relative min-w-60 flex-1">
						<Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
						<input
							className="bg-background w-full rounded-lg border py-2 pr-3 pl-9 text-sm"
							placeholder="Search templates"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					</div>
					<div className="bg-muted/60 flex rounded-lg p-0.5" role="group" aria-label="Size">
						{ASPECT_FILTERS.map(([id, label]) => (
							<button
								key={id}
								type="button"
								onClick={() => setAspect(id)}
								aria-pressed={aspect === id}
								className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition", aspect === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
								data-template-aspect={id}
							>
								{label}
							</button>
						))}
					</div>
				</div>
				<div className="flex flex-wrap gap-1.5">
					{["All", ...TEMPLATE_CATEGORIES].map((c) => (
						<button
							key={c}
							type="button"
							onClick={() => setCategory(c)}
							aria-pressed={category === c}
							className={cn(
								"rounded-full border px-3 py-1 text-xs transition",
								category === c ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
							)}
						>
							{c}
						</button>
					))}
				</div>

				{visible.length === 0 ? (
					<p className="text-muted-foreground py-16 text-center text-sm">No templates match. Try another size or search.</p>
				) : (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
						{visible.map((t) => (
							<div key={t.id} className="flex flex-col gap-1" onDoubleClick={() => void open(t)}>
								<TemplateCard template={t} selected={selectedId === t.id} onSelect={() => setSelectedId(t.id)} />
								<span className="text-muted-foreground truncate text-[11px]">
									{t.category} · {templateDuration(t).toFixed(0)}s{templateSlots(t) ? ` · ${templateSlots(t)} media slots` : ""}
								</span>
							</div>
						))}
					</div>
				)}

				{store && (
					<section className="flex flex-col gap-3 border-t pt-5" data-template-online>
						<div className="flex items-center justify-between">
							<h2 className="m-0 text-base font-semibold">From the online library</h2>
							<span className="text-muted-foreground text-xs">
								{store.catalogStatus.state === "checking"
									? "Checking the library…"
									: store.catalogStatus.state === "error"
										? store.catalogStatus.error
										: `${online.length} template pack${online.length === 1 ? "" : "s"} to download`}
							</span>
						</div>
						{online.length > 0 && (
							<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
								{online.slice(0, 120).map((p) => {
									const dl = store.downloads[p.id];
									const pct = dl?.total ? Math.round((dl.received / dl.total) * 100) : 0;
									return (
										<div key={p.id} className="flex flex-col gap-1.5" data-template-pack={p.id}>
											<div className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl bg-[#0b0d12] ring-1 ring-white/5">
												{p.thumbnailUrl ? (
													// eslint-disable-next-line @next/next/no-img-element -- catalog thumbnail
													<img src={p.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
												) : (
													<CloudDownload className="text-muted-foreground size-8" />
												)}
												{dl && (dl.status === "downloading" || dl.status === "installing") && (
													<div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
														<div className="bg-primary h-full" style={{ width: `${pct}%` }} />
													</div>
												)}
											</div>
											<div className="flex items-center gap-2">
												<span className="min-w-0 flex-1 truncate text-xs">{p.title}</span>
												<Button size="sm" variant="secondary" className="h-7 px-2 text-xs" disabled={!!dl && dl.status !== "error"} onClick={() => install(p)}>
													{dl?.status === "installing" ? <Check className="size-3.5" /> : <CloudDownload className="size-3.5" />}
													{dl && dl.status !== "error" ? `${pct}%` : formatBytes(p.sizeBytes)}
												</Button>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</section>
				)}
			</div>
		</LibraryPageShell>
	);
}
