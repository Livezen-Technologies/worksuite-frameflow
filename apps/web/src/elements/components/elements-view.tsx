"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { asFile, isMediaItem, usePackItems } from "@/asset-library/pack-items";
import { insertPackMedia } from "@/asset-library/pack-media";
import type { PackContentItem } from "@/asset-library/registry";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { buildGraphicPreviewUrl } from "@/graphics";
import { StickersView } from "@/stickers/components/assets-view";
import { AnimationsView } from "@/lottie/components/animations-view";
import { GifLibrary } from "@/gifs/components/gif-library";
import {
	buildGraphicElement,
	buildTextElement,
} from "@/timeline/element-utils";
import { cn } from "@/utils/ui";
import {
	ELEMENT_CATEGORIES,
	ELEMENT_PRESETS,
	type ElementCategory,
	type ElementPreset,
} from "../library";

type Filter = "All" | "GIFs" | "Animations" | "Downloaded" | ElementCategory;

/** Transform scale for a graphic drawn from a square source contained in the frame. */
function graphicScale({
	size,
	frame,
}: {
	size: number | "frame";
	frame: { width: number; height: number };
}) {
	if (size !== "frame")
		return { "transform.scaleX": size, "transform.scaleY": size };
	const base = Math.min(frame.width, frame.height);
	return {
		"transform.scaleX": frame.width / base,
		"transform.scaleY": frame.height / base,
	};
}

function Preview({ preset }: { preset: ElementPreset }) {
	if (preset.kind === "graphic") {
		const url = buildGraphicPreviewUrl({
			definitionId: preset.definitionId,
			params: preset.params,
			size: 128,
		});
		return (
			// eslint-disable-next-line @next/next/no-img-element -- data URL drawn locally
			<img
				src={url}
				alt=""
				className={cn(
					"object-contain",
					preset.size === "frame" ? "size-full" : "size-3/4",
				)}
			/>
		);
	}
	const p = preset.params;
	return (
		<span
			className="max-w-full truncate px-2 py-1 text-[11px] font-bold"
			style={{
				color: String(p.color ?? "#fff"),
				background: p["background.enabled"]
					? String(p["background.color"])
					: undefined,
				borderRadius: Math.min(
					14,
					Number(p["background.cornerRadius"] ?? 0) / 3,
				),
				fontFamily: `"${String(p.fontFamily ?? "Inter")}", "Noto Sans Sinhala", sans-serif`,
			}}
		>
			{String(p.content)}
		</span>
	);
}

/** Elements sidebar: click to add at the playhead on a new layer. */
export function ElementsView() {
	const editor = useEditor();
	const [filter, setFilter] = useState<Filter>("All");
	const [query, setQuery] = useState("");
	const downloaded = usePackItems({ types: ["graphics", "stickers"], parse: asFile })
		.map((d) => d.value)
		.filter(isMediaItem);
	const [adding, setAdding] = useState<string | null>(null);

	const addDownloaded = async (item: PackContentItem) => {
		setAdding(item.id);
		try {
			await insertPackMedia({ editor, item });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Couldn't add ${item.name}`);
		} finally {
			setAdding(null);
		}
	};

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return ELEMENT_PRESETS.filter(
			(p) =>
				(filter === "All" || p.category === filter) &&
				(!q ||
					p.name.toLowerCase().includes(q) ||
					p.category.toLowerCase().includes(q)),
		);
	}, [filter, query]);

	const add = (preset: ElementPreset) => {
		const startTime = editor.playback.getCurrentTime();
		if (preset.kind === "text") {
			editor.timeline.insertElement({
				element: buildTextElement({
					raw: { name: preset.name, params: preset.params },
					startTime,
				}),
				placement: { mode: "auto" },
			});
			return;
		}
		const frame = editor.project.getActive().settings.canvasSize;
		editor.timeline.insertElement({
			element: buildGraphicElement({
				definitionId: preset.definitionId,
				name: preset.name,
				startTime,
				params: {
					...preset.params,
					...graphicScale({ size: preset.size, frame }),
					...(preset.animation ?? {}),
				},
			}),
			placement: { mode: "auto" },
		});
	};

	const filters: Filter[] = ["All", "GIFs", "Animations", ...(downloaded.length ? (["Downloaded"] as const) : []), ...ELEMENT_CATEGORIES];

	return (
		<PanelView title="Elements">
			<div className="flex h-full flex-col gap-2" data-elements-view>
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
				{filter === "GIFs" ? (
					<div className="min-h-0 flex-1">
						<GifLibrary />
					</div>
				) : filter === "Animations" ? (
					<div className="min-h-0 flex-1">
						<AnimationsView />
					</div>
				) : filter === "Downloaded" ? (
					<div className="grid grid-cols-3 gap-x-2 gap-y-3" data-elements-downloaded>
						{downloaded.map((item) => (
							<button
								key={item.id}
								type="button"
								title={`Add ${item.name} at the playhead`}
								disabled={adding === item.id}
								data-element-download={item.id}
								onClick={() => void addDownloaded(item)}
								className="group flex min-w-0 flex-col items-center gap-1 disabled:opacity-50"
							>
								<span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-[repeating-conic-gradient(#1a1d24_0%_25%,#14171d_0%_50%)] bg-[length:16px_16px] ring-1 ring-white/5 transition group-hover:ring-[#22D3EE]">
									{/\.(webm|mp4|mov)$/i.test(item.url) ? (
										<video src={item.url} muted loop autoPlay playsInline className="size-full object-contain" />
									) : (
										// eslint-disable-next-line @next/next/no-img-element -- local pack file
										<img src={item.url} alt="" className="size-full object-contain" />
									)}
								</span>
								<span className="text-muted-foreground group-hover:text-foreground w-full truncate text-center text-[11px]">
									{item.name}
								</span>
							</button>
						))}
					</div>
				) : filter === "Stickers" ? (
					<div className="-mx-2 min-h-0 flex-1">
						<StickersView />
					</div>
				) : (
					<>
						<Input
							placeholder="Search elements"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="h-8"
						/>
						<div className="grid grid-cols-3 gap-x-2 gap-y-3">
							{visible.map((preset) => (
								<button
									key={preset.id}
									type="button"
									title={`Add ${preset.name} at the playhead`}
									data-element={preset.id}
									onClick={() => add(preset)}
									className="group flex min-w-0 flex-col items-center gap-1"
								>
									<span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-[repeating-conic-gradient(#1a1d24_0%_25%,#14171d_0%_50%)] bg-[length:16px_16px] ring-1 ring-white/5 transition group-hover:ring-[#22D3EE]">
										<Preview preset={preset} />
									</span>
									<span className="text-muted-foreground group-hover:text-foreground w-full truncate text-center text-[11px]">
										{preset.name}
									</span>
								</button>
							))}
							{visible.length === 0 && (
								<p className="text-muted-foreground col-span-3 py-6 text-center text-xs">
									No elements match.
								</p>
							)}
						</div>
					</>
				)}
			</div>
		</PanelView>
	);
}
