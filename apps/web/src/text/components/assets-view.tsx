"use client";

import { DownloadedLabel } from "@/asset-library/components/downloaded-label";
import { PacksView } from "@/packs/components/packs-view";
import { TextLibraryView } from "@/text-library/components/text-library-view";
import { parseTextTemplate, usePackItems } from "@/asset-library/pack-items";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { loadFonts } from "@/fonts/google-fonts";
import type { ParamValues } from "@/params";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { buildTextElement } from "@/timeline/element-utils";
import { cn } from "@/utils/ui";
import {
	TEMPLATE_FONTS,
	TEXT_TEMPLATE_CATEGORIES,
	TEXT_TEMPLATES,
	templateStyle,
	useMyTextTemplates,
	type TextTemplate,
	type TextTemplateCategory,
} from "../templates";

type Filter = "All" | TextTemplateCategory | "My templates" | "Downloaded";

type Read<T> = { params: ParamValues; key: string; fallback: T };

function str({ params, key, fallback }: Read<string>): string {
	const value = params[key];
	return typeof value === "string" ? value : fallback;
}

function num({ params, key, fallback }: Read<number>): number {
	const value = params[key];
	return typeof value === "number" ? value : fallback;
}

/** A CSS approximation of a template, for its gallery tile. */
function previewStyle(params: ParamValues): CSSProperties {
	const shadows: string[] = [];
	if (params["glow.enabled"] === true) {
		const color = str({
			params: params,
			key: "glow.color",
			fallback: "#2EC4FF",
		});
		shadows.push(`0 0 6px ${color}`, `0 0 12px ${color}`);
	}
	if (params["shadow.enabled"] === true) {
		const k = 0.18;
		shadows.push(
			`${num({ params: params, key: "shadow.offsetX", fallback: 0 }) * k}px ${num({ params: params, key: "shadow.offsetY", fallback: 6 }) * k}px ${num({ params: params, key: "shadow.blur", fallback: 10 }) * k}px ${str({ params: params, key: "shadow.color", fallback: "#000000" })}`,
		);
	}
	const background = params["background.enabled"] === true;
	return {
		fontFamily: `"${str({ params: params, key: "fontFamily", fallback: "Inter" })}", "Noto Sans Sinhala", sans-serif`,
		fontWeight: str({ params: params, key: "fontWeight", fallback: "normal" }),
		fontStyle: str({ params: params, key: "fontStyle", fallback: "normal" }),
		color: str({ params: params, key: "color", fallback: "#ffffff" }),
		fontSize: Math.min(
			20,
			Math.max(
				10,
				num({ params: params, key: "fontSize", fallback: 15 }) * 0.8,
			),
		),
		letterSpacing:
			num({ params: params, key: "letterSpacing", fallback: 0 }) * 0.3,
		textShadow: shadows.join(", ") || undefined,
		WebkitTextStroke:
			params["stroke.enabled"] === true
				? `1.2px ${str({ params: params, key: "stroke.color", fallback: "#000000" })}`
				: undefined,
		background: background
			? str({ params: params, key: "background.color", fallback: "#000000" })
			: undefined,
		borderRadius: background
			? Math.min(
					12,
					num({ params: params, key: "background.cornerRadius", fallback: 0 }) /
						3,
				)
			: undefined,
		padding: background ? "2px 8px" : undefined,
		whiteSpace: "pre-line",
		lineHeight: 1.15,
		textAlign: "center",
	};
}

function TextTemplatesView() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	const { selectedElements } = useElementSelection();
	const myTemplates = useMyTextTemplates((s) => s.templates);
	const saveTemplate = useMyTextTemplates((s) => s.save);
	const removeTemplate = useMyTextTemplates((s) => s.remove);
	const downloadedItems = usePackItems({ types: ["text-templates"], parse: parseTextTemplate });
	const downloaded = useMemo<TextTemplate[]>(() => downloadedItems.map(({ value }) => ({ ...value, categories: [] })), [downloadedItems]);
	const [filter, setFilter] = useState<Filter>("All");
	const [query, setQuery] = useState("");

	useEffect(() => {
		loadFonts({ families: TEMPLATE_FONTS }).catch(() => {});
	}, []);

	const selectedText = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.filter(({ element }) => element.type === "text");

	const visible = useMemo(() => {
		const pool =
			filter === "My templates"
				? myTemplates
				: filter === "All"
					? [...TEXT_TEMPLATES, ...downloaded, ...myTemplates]
					: filter === "Downloaded"
						? downloaded
						: TEXT_TEMPLATES.filter((t) => t.categories.includes(filter));
		const q = query.trim().toLowerCase();
		return q ? pool.filter((t) => t.name.toLowerCase().includes(q)) : pool;
	}, [filter, query, myTemplates, downloaded]);

	const addToTimeline = (template: TextTemplate) => {
		if (!editor.scenes.getActiveScene()) return;
		const family = template.params.fontFamily;
		if (typeof family === "string") {
			loadFonts({ families: [family] }).catch(() => {});
		}
		editor.timeline.insertElement({
			element: buildTextElement({
				raw: { name: template.name, params: template.params },
				startTime: editor.playback.getCurrentTime(),
			}),
			placement: { mode: "auto" },
		});
	};

	const applyToSelection = (template: TextTemplate) => {
		if (selectedText.length === 0) {
			toast.info("Select text or caption clips to apply a template's style");
			return;
		}
		const style = templateStyle(template.params);
		editor.timeline.updateElements({
			updates: selectedText.map(({ track, element }) => ({
				trackId: track.id,
				elementId: element.id,
				patch: { params: { ...element.params, ...style } },
			})),
		});
		toast.success(
			`Applied “${template.name}” to ${selectedText.length} clip${selectedText.length === 1 ? "" : "s"}`,
		);
	};

	const saveSelection = () => {
		const first = selectedText[0];
		if (!first) return;
		const content = first.element.params.content;
		const template = saveTemplate({
			name: typeof content === "string" ? content.slice(0, 24) : "My template",
			params: { ...templateStyle(first.element.params), content },
		});
		setFilter("My templates");
		toast.success(`Saved “${template.name}” to My templates`);
	};

	const filters: Filter[] = [
		"All",
		...TEXT_TEMPLATE_CATEGORIES,
		"My templates",
		...(downloaded.length ? (["Downloaded"] as const) : []),
	];

	return (
		<PanelView title="Text">
			<div className="flex flex-col gap-2">
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
							{f === "Downloaded" ? <DownloadedLabel /> : f}
						</button>
					))}
				</div>
				<div className="grid grid-cols-2 gap-2">
					{visible.map((template) => (
						<div key={template.id} className="group relative">
							<button
								type="button"
								title={`Add “${template.name}” at the playhead`}
								data-template={template.id}
								onClick={() => addToTimeline(template)}
								className="flex aspect-video w-full items-center justify-center overflow-hidden rounded border bg-[radial-gradient(circle_at_30%_20%,#3b3f5c,#121320)] p-2 hover:ring-2 hover:ring-primary"
							>
								<span style={previewStyle(template.params)}>
									{str({
										params: template.params,
										key: "content",
										fallback: template.name,
									})}
								</span>
							</button>
							<div className="mt-1 flex items-center justify-between gap-1">
								<span className="truncate text-[11px]">{template.name}</span>
								{selectedText.length > 0 && (
									<button
										type="button"
										className="text-primary text-[10px] hover:underline"
										onClick={() => applyToSelection(template)}
									>
										Apply
									</button>
								)}
								{template.id.startsWith("my-") && (
									<button
										type="button"
										className="text-muted-foreground text-[10px] hover:underline"
										onClick={() => removeTemplate(template.id)}
									>
										Delete
									</button>
								)}
							</div>
						</div>
					))}
					{visible.length === 0 && (
						<p className="text-muted-foreground col-span-2 py-6 text-center text-xs">
							{filter === "My templates"
								? "Select a styled text clip and save it here."
								: "No templates match."}
						</p>
					)}
				</div>
				<div className="flex flex-col gap-1 border-t pt-2">
					<p className="text-muted-foreground text-[11px]">
						{selectedText.length > 0
							? `${selectedText.length} text clip${selectedText.length === 1 ? "" : "s"} selected — click Apply under a template to restyle.`
							: "Select text or caption clips to restyle them."}
					</p>
					<Button
						variant="outline"
						size="sm"
						disabled={selectedText.length === 0}
						onClick={saveSelection}
					>
						Save selected as my template
					</Button>
				</div>
			</div>
		</PanelView>
	);
}

/** Text sidebar: text templates, or the social template packs (SP-09). */
export function TextView() {
	const [mode, setMode] = useState<"templates" | "animate" | "packs">("templates");
	return (
		<div className="flex h-full flex-col">
			<div className="flex gap-4 border-b px-3 pt-2" role="tablist">
				{(["templates", "animate", "packs"] as const).map((m) => (
					<button
						key={m}
						type="button"
						role="tab"
						aria-selected={mode === m}
						onClick={() => setMode(m)}
						data-text-mode={m}
						className={cn(
							"-mb-px border-b-2 pb-1.5 text-sm",
							mode === m ? "border-primary text-foreground" : "text-muted-foreground border-transparent",
						)}
					>
						{m === "templates" ? "Text" : m === "animate" ? "Animate" : "Packs"}
					</button>
				))}
			</div>
			<div className="min-h-0 flex-1">{mode === "packs" ? <PacksView /> : mode === "animate" ? <TextLibraryView /> : <TextTemplatesView />}</div>
		</div>
	);
}
