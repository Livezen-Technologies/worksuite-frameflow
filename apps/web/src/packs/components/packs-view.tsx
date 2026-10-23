"use client";

import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import type { EditorCore } from "@/core";
import { useBrandKit } from "@/brand/store";
import { useTranscriptStore } from "@/transcript/store";
import { hostAndGuest } from "../speakers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEditor } from "@/editor/use-editor";
import type { ProjectTemplate } from "@/templates/project-templates";
import { cn } from "@/utils/ui";
import {
	applyPackTemplates,
	brandForPacks,
	chapterPlacements,
	packSetPlacements,
} from "../apply";
import {
	compilePackTemplate,
	templateAspects,
	type PackFields,
} from "../compile";
import { PACKS } from "../data";
import { useCustomPacks } from "../custom";
import { CustomPackBar } from "./custom-pack-bar";
import { usePackStore } from "../store";
import {
	ASPECT_SIZES,
	LANGUAGE_LABELS,
	PURPOSE_LABELS,
	type AspectId,
	type PackLanguage,
	type PackTemplate,
	type Purpose,
} from "../types";

const LANGUAGES: PackLanguage[] = ["en", "si", "mixed"];

/** Fields the user can fill for placeholders (SP-06). */
const FIELDS: { key: string; label: string }[] = [
	{ key: "channel", label: "Channel" },
	{ key: "handle", label: "Handle (no @)" },
	{ key: "page", label: "Page" },
	{ key: "title", label: "Title" },
	{ key: "name", label: "Name" },
	{ key: "role", label: "Role" },
	{ key: "show", label: "Show" },
	{ key: "episode", label: "Episode no." },
	{ key: "host", label: "Host" },
	{ key: "guest", label: "Guest" },
	{ key: "topic", label: "Topic" },
	{ key: "quote", label: "Quote" },
	{ key: "sponsor", label: "Sponsor" },
	{ key: "date", label: "Date" },
	{ key: "time", label: "Time" },
	{ key: "place", label: "Place" },
	{ key: "discount", label: "Discount" },
	{ key: "part", label: "Part" },
];

/** Lines of every text clip and the project's transcript, for speaker names (SP-06). */
function speakerLines(editor: EditorCore): string[] {
	const tracks = editor.scenes.getActiveScene().tracks;
	const lines: string[] = [];
	for (const track of [...tracks.overlay, tracks.main])
		for (const el of track.elements)
			if (el.type === "text" && typeof el.params.content === "string") lines.push(el.params.content);
	const projectId = editor.project.getActive().metadata.id;
	const transcript = useTranscriptStore.getState().byProject[projectId];
	for (const segment of transcript?.segments ?? []) lines.push(segment.text);
	return lines;
}

function nearestAspect({
	width,
	height,
	options,
}: {
	width: number;
	height: number;
	options: AspectId[];
}): AspectId {
	const ratio = width / height;
	return options.reduce((best, a) => {
		const r = ASPECT_SIZES[a].width / ASPECT_SIZES[a].height;
		const b = ASPECT_SIZES[best].width / ASPECT_SIZES[best].height;
		return Math.abs(r - ratio) < Math.abs(b - ratio) ? a : best;
	}, options[0]);
}

/** A small live drawing of the compiled template at its midpoint. */
function MiniPreview({ template, logoUrl }: { template: ProjectTemplate; logoUrl?: string }) {
	const { width, height } = template.aspect;
	const at = Math.min(
		1.2,
		...template.layers.map((l) => l.start + l.duration - 0.01),
	);
	return (
		<div
			className="relative w-full overflow-hidden rounded-md bg-gradient-to-br from-slate-600 to-slate-800"
			style={{
				aspectRatio: `${width} / ${height}`,
				containerType: "inline-size",
			}}
		>
			{template.layers
				.filter((l) => l.start <= at && at < l.start + l.duration)
				.map((layer, i) => {
					if (layer.kind === "media") return null;
					const left = `${((layer.x ?? 0) + 0.5) * 100}%`;
					const top = `${((layer.y ?? 0) + 0.5) * 100}%`;
					if (layer.kind === "logo")
						return logoUrl ? (
							<img
								key={i}
								alt=""
								src={logoUrl}
								data-pack-logo
								className="absolute -translate-x-1/2 -translate-y-1/2 object-contain"
								style={{ left, top, width: `${layer.width * 100}%`, height: `${layer.height * 100}%` }}
							/>
						) : null;
					if (layer.kind === "shape")
						return (
							<div
								key={i}
								className="absolute -translate-x-1/2 -translate-y-1/2"
								style={{
									left,
									top,
									width: `${layer.width * 100}%`,
									height: `${layer.height * 100}%`,
									background: layer.fill,
									opacity: layer.opacity ?? 1,
									borderRadius:
										layer.definitionId === "ellipse"
											? "50%"
											: (layer.cornerRadius ?? 0) / 8,
								}}
							/>
						);
					const style = layer.style;
					const box = style["background.enabled"] === true;
					return (
						<div
							key={i}
							className={cn(
								"absolute -translate-y-1/2 whitespace-pre-line leading-tight",
								// Left/right text is placed by that edge, as in the editor.
								style.textAlign === "left"
									? ""
									: style.textAlign === "right"
										? "-translate-x-full"
										: "-translate-x-1/2",
							)}
							style={{
								left,
								top,
								maxWidth: "95%",
								fontFamily: `"${String(style.fontFamily)}", "Noto Sans Sinhala", sans-serif`,
								fontWeight: style.fontWeight === "bold" ? 700 : 400,
								// Editor text units are relative to frame height.
								fontSize: `${(Number(style.fontSize) * height) / (0.9 * width)}cqw`,
								color: String(style.color),
								textAlign:
									style.textAlign === "left"
										? "left"
										: style.textAlign === "right"
											? "right"
											: "center",
								background: box ? String(style["background.color"]) : undefined,
								padding: box ? "0.1em 0.4em" : undefined,
								borderRadius: box ? "0.6em" : undefined,
								WebkitTextStroke:
									style["stroke.enabled"] === true
										? `0.04em ${String(style["stroke.color"])}`
										: undefined,
							}}
						>
							{layer.content}
						</div>
					);
				})}
		</div>
	);
}

export function PacksView() {
	const editor = useEditor();
	const canvas = useEditor(
		(e) => e.project.getActiveOrNull()?.settings.canvasSize,
	);
	const store = usePackStore();
	const kit = useBrandKit();
	const customPacks = useCustomPacks((s) => s.packs);
	const allPacks = [...PACKS, ...customPacks];
	const pack = allPacks.find((p) => p.id === store.pack) ?? PACKS[0];
	const projectAspect = canvas
		? nearestAspect({
				width: canvas.width,
				height: canvas.height,
				options: pack.aspects,
			})
		: pack.aspects[0];
	const [aspectChoice, setAspectChoice] = useState<AspectId | null>(null);
	const aspect =
		aspectChoice && pack.aspects.includes(aspectChoice)
			? aspectChoice
			: projectAspect;
	const [purpose, setPurpose] = useState<Purpose | "all" | "favourites">("all");
	const [query, setQuery] = useState("");
	const [showFields, setShowFields] = useState(false);
	const brand = store.useBrand ? brandForPacks({ kit }) : undefined;
	const language = store.language;

	const templates = useMemo(() => {
		const q = query.trim().toLowerCase();
		return pack.templates.filter(
			(t) =>
				templateAspects({ pack, template: t }).includes(aspect) &&
				(purpose === "all" ||
					(purpose === "favourites"
						? store.favourites.includes(`${pack.id}:${t.id}`)
						: t.purpose === purpose)) &&
				(!q || t.name.toLowerCase().includes(q)),
		);
	}, [pack, aspect, purpose, query, store.favourites]);

	const fields = useMemo((): PackFields => {
		// The brand kit's name stands in for the channel and page (SP-06).
		const named: PackFields =
			kit.name && kit.name !== "My brand"
				? { channel: kit.name, page: kit.name, show: kit.name }
				: {};
		return {
			...named,
			...Object.fromEntries(
				Object.entries(store.fields).filter(([, v]) => v.trim()),
			),
		};
	}, [kit.name, store.fields]);

	const differs =
		canvas &&
		(ASPECT_SIZES[aspect].width / ASPECT_SIZES[aspect].height).toFixed(3) !==
			(canvas.width / canvas.height).toFixed(3);

	const add = ({
		template,
		atBookmarks = false,
	}: {
		template: PackTemplate;
		atBookmarks?: boolean;
	}) => {
		const placements = atBookmarks
			? chapterPlacements({ editor, template })
			: [{ template, at: editor.playback.getCurrentTime() }];
		if (placements.length === 0) {
			toast.info("Add bookmarks (B) where chapters start, then try again.");
			return;
		}
		void applyPackTemplates({
			editor,
			pack,
			aspect,
			language,
			fields,
			brand,
			placements,
		});
		toast.success(
			atBookmarks
				? `Added ${placements.length} chapter titles`
				: `Added “${template.name}”`,
		);
	};

	const purposes = [...new Set(pack.templates.map((t) => t.purpose))];

	return (
		<div className="flex h-full flex-col" data-packs-view>
			<div className="flex flex-col gap-2 border-b p-3">
				<div className="flex flex-wrap gap-1">
					{allPacks.map((p) => (
						<button
							key={p.id}
							type="button"
							onClick={() => store.setPack(p.id)}
							data-pack={p.id}
							className={cn(
								"rounded-full border px-3 py-1 text-xs",
								p.id === pack.id
									? "border-primary bg-primary/15 text-primary"
									: "hover:bg-accent",
							)}
						>
							{p.name}
						</button>
					))}
				</div>
				<p className="text-muted-foreground text-[11px] leading-snug">
					{pack.description}
				</p>
				<CustomPackBar editor={editor} pack={pack} aspect={aspect} />
				<div className="flex flex-wrap items-center gap-1.5">
					<div className="bg-accent flex rounded-md p-0.5">
						{LANGUAGES.map((l) => (
							<button
								key={l}
								type="button"
								onClick={() => store.setLanguage(l)}
								data-pack-language={l}
								className={cn(
									"rounded px-2 py-0.5 text-xs",
									language === l
										? "bg-background shadow-sm"
										: "text-muted-foreground",
								)}
							>
								{LANGUAGE_LABELS[l]}
							</button>
						))}
					</div>
					<select
						className="bg-accent h-7 rounded-md border px-1.5 text-xs"
						value={aspect}
						onChange={(e) =>
							setAspectChoice(
								pack.aspects.find((a) => a === e.target.value) ?? null,
							)
						}
						aria-label="Shape"
					>
						{pack.aspects.map((a) => (
							<option key={a} value={a}>
								{a}
							</option>
						))}
					</select>
					<label className="flex items-center gap-1 text-xs">
						<input
							type="checkbox"
							checked={store.useBrand}
							onChange={(e) => store.setUseBrand(e.target.checked)}
						/>
						Brand kit
					</label>
				</div>
				{differs && (
					<div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px]">
						<span>The project isn&apos;t {aspect}.</span>
						<button
							type="button"
							className="underline"
							onClick={() =>
								void editor.project.updateSettings({
									settings: {
										canvasSize: ASPECT_SIZES[aspect],
										canvasSizeMode: "custom",
									},
								})
							}
						>
							Switch project to {aspect}
						</button>
					</div>
				)}
				<div className="flex gap-1.5">
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search templates"
						className="h-7 text-xs"
					/>
					<Button
						size="sm"
						variant="secondary"
						className="h-7 text-xs"
						onClick={() => setShowFields((v) => !v)}
					>
						Your details
					</Button>
				</div>
				{showFields && (
					<div className="grid grid-cols-2 gap-1.5" data-pack-fields>
						<Button
							variant="text"
							className="col-span-2 h-6 justify-start px-0 text-xs"
							data-names-from-transcript
							onClick={() => {
								const found = hostAndGuest({ lines: speakerLines(editor) });
								if (!found.host) {
									toast.info("No speaker names found", {
										description: "Captions or a transcript with \"Name:\" lines or WebVTT voice tags are needed.",
									});
									return;
								}
								store.setField({ key: "host", value: found.host });
								if (found.guest) store.setField({ key: "guest", value: found.guest });
								toast.success(`Host: ${found.host}${found.guest ? `, guest: ${found.guest}` : ""}`);
							}}
						>
							Fill host and guest from the transcript
						</Button>
						{FIELDS.map((f) => (
							<Input
								key={f.key}
								className="h-7 text-xs"
								placeholder={f.label}
								aria-label={f.label}
								value={store.fields[f.key] ?? ""}
								onChange={(e) =>
									store.setField({ key: f.key, value: e.target.value })
								}
							/>
						))}
					</div>
				)}
				<div className="flex flex-wrap gap-1">
					{(["all", "favourites", ...purposes] as const).map((p) => (
						<button
							key={p}
							type="button"
							onClick={() => setPurpose(p)}
							className={cn(
								"rounded-full border px-2 py-0.5 text-[11px]",
								purpose === p
									? "border-primary bg-primary/10"
									: "hover:bg-accent",
							)}
						>
							{p === "all"
								? "All"
								: p === "favourites"
									? "★ Favourites"
									: PURPOSE_LABELS[p]}
						</button>
					))}
				</div>
				<Button
					size="sm"
					className="h-7 text-xs"
					onClick={() => {
						const placements = packSetPlacements({ editor, pack, aspect });
						void applyPackTemplates({
							editor,
							pack,
							aspect,
							language,
							fields,
							brand,
							placements,
						});
						toast.success(
							`Added the ${pack.name} set (${placements.length} templates)`,
						);
					}}
					data-use-pack
				>
					Use the whole {pack.name} pack
				</Button>
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<div className="grid grid-cols-2 gap-2 p-3">
					{templates.map((t) => {
						const compiled = compilePackTemplate({
							pack,
							template: t,
							aspect,
							language,
							fields,
							brand,
						});
						const favouriteId = `${pack.id}:${t.id}`;
						const favourite = store.favourites.includes(favouriteId);
						return (
							<div
								key={t.id}
								className="group flex flex-col gap-1"
								data-pack-template={t.id}
							>
								<button
									type="button"
									onClick={() => add({ template: t })}
									className="relative rounded-md ring-offset-2 hover:ring-2 hover:ring-primary"
									title={`Add “${t.name}” at the playhead`}
								>
									<MiniPreview template={compiled} logoUrl={brand?.logo?.dataUrl} />
								</button>
								<div className="flex items-center gap-1">
									<span className="min-w-0 flex-1 truncate text-[11px]">
										{t.name}
									</span>
									<button
										type="button"
										aria-label={
											favourite ? "Remove from favourites" : "Add to favourites"
										}
										onClick={() => store.toggleFavourite(favouriteId)}
									>
										<Star
											className={cn(
												"size-3",
												favourite
													? "fill-amber-400 text-amber-400"
													: "text-muted-foreground",
											)}
										/>
									</button>
								</div>
								{t.id === "chapter" && (
									<button
										type="button"
										className="text-primary text-left text-[10px] underline"
										onClick={() => add({ template: t, atBookmarks: true })}
									>
										At every bookmark
									</button>
								)}
							</div>
						);
					})}
				</div>
			</ScrollArea>
		</div>
	);
}
