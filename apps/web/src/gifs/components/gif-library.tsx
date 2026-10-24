"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import type { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import { animatedImageDuration } from "@/media/animated-image";
import { processMediaAssets } from "@/media/processing";
import { defaultStillDuration } from "@/timeline/creation";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { cn } from "@/utils/ui";
import { mediaTimeFromSeconds } from "@/wasm";
import {
	downloadGif,
	GIF_CATEGORIES,
	gifSuggestions,
	giphyKey,
	searchGifs,
	useGifLibrary,
	type GifCategoryId,
	type GifKind,
	type GifResult,
} from "../giphy";

/** GIFs downloaded on hover, so a drag can carry the file onto the timeline. */
const prefetched = new Map<string, File>();
const prefetching = new Map<string, Promise<File | null>>();
function prefetch(gif: GifResult) {
	if (prefetched.has(gif.id) || prefetching.has(gif.id)) return;
	prefetching.set(
		gif.id,
		downloadGif(gif)
			.then((file) => {
				prefetched.set(gif.id, file);
				return file;
			})
			.catch(() => null)
			.finally(() => prefetching.delete(gif.id)),
	);
}

/** Adds a GIF to the project's media and the timeline at the playhead, on its own layer. */
export async function insertGif({ editor, gif }: { editor: EditorCore; gif: GifResult }) {
	const project = editor.project.getActive();
	const file = await downloadGif(gif);
	const [processed] = await processMediaAssets({ files: [file] });
	if (!processed) throw new Error("Couldn't read the GIF.");
	const asset = await editor.media.addMediaAsset({ projectId: project.metadata.id, asset: processed });
	if (!asset) throw new Error("Couldn't add the GIF to the project.");
	const loop = await animatedImageDuration(file);
	// Short loops repeat to fill at least the default still length.
	const seconds = loop ? Math.max(loop, Math.ceil(5 / loop) * loop) : null;
	editor.timeline.insertElement({
		element: buildElementFromMedia({
			mediaId: asset.id,
			mediaType: "image",
			name: gif.title,
			duration: seconds ? mediaTimeFromSeconds({ seconds }) : defaultStillDuration(),
			startTime: editor.playback.getCurrentTime(),
		}),
		placement: { mode: "auto" },
	});
	useGifLibrary.getState().markUsed(gif);
}

function KeyPrompt() {
	const setApiKey = useGifLibrary((s) => s.setApiKey);
	const [value, setValue] = useState("");
	return (
		<div className="text-muted-foreground flex flex-col gap-2 py-4 text-xs" data-gif-key-prompt>
			<p>
				Searching GIFs needs a free GIPHY API key. Create one at developers.giphy.com, then paste it here. It is kept
				on this device.
			</p>
			<div className="flex gap-1">
				<Input
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder="GIPHY API key"
					className="h-8"
				/>
				<button
					type="button"
					className="bg-primary text-primary-foreground rounded px-3 text-xs"
					onClick={() => setApiKey(value)}
					disabled={!value.trim()}
				>
					Save
				</button>
			</div>
		</div>
	);
}

/** GIF and sticker search (GIPHY) with categories, favourites and recents. */
export function GifLibrary() {
	const editor = useEditor();
	const { favorites, recent, toggleFavorite } = useGifLibrary();
	const apiKey = useGifLibrary((s) => s.apiKey);
	const hasKey = Boolean(apiKey || giphyKey());
	const [kind, setKind] = useState<GifKind>("stickers");
	const [category, setCategory] = useState<GifCategoryId>("trending");
	const [query, setQuery] = useState("");
	const [submitted, setSubmitted] = useState("");
	const [results, setResults] = useState<GifResult[]>([]);
	const [more, setMore] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [selected, setSelected] = useState<GifResult | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const abort = useRef<AbortController | null>(null);

	const local = category === "favorites" ? favorites : category === "recent" ? recent : null;
	const searchQuery =
		submitted || (GIF_CATEGORIES.find((c) => c.id === category)?.query ?? null);

	const load = async (offset: number) => {
		abort.current?.abort();
		const controller = new AbortController();
		abort.current = controller;
		setLoading(true);
		setError(null);
		try {
			const page = await searchGifs({ query: searchQuery, kind, offset, signal: controller.signal });
			setResults((prev) => (offset ? [...prev, ...page.results] : page.results));
			setMore(page.more);
		} catch (e) {
			if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
		} finally {
			if (!controller.signal.aborted) setLoading(false);
		}
	};

	useEffect(() => {
		if (!hasKey || local) return;
		queueMicrotask(() => void load(0));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- reload on these inputs only
	}, [hasKey, kind, category, submitted]);

	useEffect(() => {
		const controller = new AbortController();
		const timer = setTimeout(() => {
			if (!hasKey || !query.trim() || query === submitted) return setSuggestions([]);
			gifSuggestions({ query, signal: controller.signal })
				.then(setSuggestions)
				.catch(() => {});
		}, 250);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}, [hasKey, query, submitted]);

	const add = async (gif: GifResult) => {
		setBusy(gif.id);
		try {
			await insertGif({ editor, gif });
		} catch (e) {
			toast.error("Couldn't add the GIF", { description: e instanceof Error ? e.message : String(e) });
		} finally {
			setBusy(null);
		}
	};

	const shown = local ?? results;
	const chips: Array<{ id: GifCategoryId; label: string }> = [
		...GIF_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
		{ id: "favorites", label: "Favorites" },
		{ id: "recent", label: "Recent" },
	];

	return (
		<div className="flex h-full min-h-0 flex-col gap-2" data-gif-library>
			<div className="flex gap-1">
				{(["stickers", "gifs"] as const).map((k) => (
					<button
						key={k}
						type="button"
						data-gif-kind={k}
						onClick={() => setKind(k)}
						className={cn(
							"flex-1 rounded border px-2 py-1 text-[11px]",
							kind === k ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent",
						)}
					>
						{k === "stickers" ? "Stickers (transparent)" : "GIFs"}
					</button>
				))}
			</div>
			{!hasKey ? (
				<KeyPrompt />
			) : (
				<>
					<form
						className="relative"
						onSubmit={(e) => {
							e.preventDefault();
							setSubmitted(query.trim());
							setSuggestions([]);
							if (category === "favorites" || category === "recent") setCategory("trending");
						}}
					>
						<Input
							placeholder="Search GIPHY"
							value={query}
							onChange={(e) => {
								setQuery(e.target.value);
								if (!e.target.value) setSubmitted("");
							}}
							className="h-8"
							data-gif-search
						/>
						{suggestions.length > 0 && (
							<div className="bg-popover absolute inset-x-0 top-9 z-10 rounded border p-1 shadow">
								{suggestions.map((s) => (
									<button
										key={s}
										type="button"
										className="hover:bg-accent block w-full rounded px-2 py-1 text-left text-xs"
										onClick={() => {
											setQuery(s);
											setSubmitted(s);
											setSuggestions([]);
										}}
									>
										{s}
									</button>
								))}
							</div>
						)}
					</form>
					<div className="flex flex-wrap gap-1">
						{chips.map((c) => (
							<button
								key={c.id}
								type="button"
								data-gif-category={c.id}
								onClick={() => {
									setCategory(c.id);
									setSubmitted("");
									setQuery("");
								}}
								className={cn(
									"rounded border px-2 py-0.5 text-[11px]",
									category === c.id && !submitted
										? "bg-primary text-primary-foreground border-primary"
										: "text-muted-foreground hover:bg-accent",
								)}
							>
								{c.label}
							</button>
						))}
					</div>
				</>
			)}
			{selected && (
				<div className="flex items-center gap-2 rounded border p-2" data-gif-selected>
					{/* eslint-disable-next-line @next/next/no-img-element -- remote animated preview */}
					<img src={selected.original} alt="" className="size-20 object-contain" />
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						<span className="truncate text-xs">{selected.title}</span>
						<button
							type="button"
							data-gif-insert
							disabled={busy === selected.id}
							onClick={() => void add(selected)}
							className="bg-primary text-primary-foreground rounded px-2 py-1 text-xs disabled:opacity-60"
						>
							{busy === selected.id ? "Adding…" : "Insert to timeline"}
						</button>
					</div>
				</div>
			)}
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="grid grid-cols-3 gap-1.5">
					{shown.map((gif) => {
						const fav = favorites.some((f) => f.id === gif.id);
						return (
							<div
								key={gif.id}
								className={cn(
									"group relative aspect-square overflow-hidden rounded bg-[repeating-conic-gradient(#1a1d24_0%_25%,#14171d_0%_50%)] bg-[length:16px_16px] ring-1 ring-white/5 hover:ring-[#22D3EE]",
									selected?.id === gif.id && "ring-[#22D3EE]",
								)}
							>
								<button
									type="button"
									title={`${gif.title}: click to preview, double-click to add, or drag onto the timeline`}
									data-gif={gif.id}
									className="size-full"
									draggable
									onPointerEnter={() => prefetch(gif)}
									onDragStart={(e) => {
										const file = prefetched.get(gif.id);
										if (!file) {
											e.preventDefault();
											prefetch(gif);
											toast.info("Getting the GIF ready. Drag it again in a moment.");
											return;
										}
										e.dataTransfer.effectAllowed = "copy";
										e.dataTransfer.items.add(file);
										useGifLibrary.getState().markUsed(gif);
									}}
									onClick={() => setSelected(gif)}
									onDoubleClick={() => void add(gif)}
								>
									{/* eslint-disable-next-line @next/next/no-img-element -- remote animated preview */}
									<img src={gif.preview} alt={gif.title} loading="lazy" className="size-full object-contain" />
								</button>
								<button
									type="button"
									aria-label={fav ? "Remove from favorites" : "Add to favorites"}
									onClick={() => toggleFavorite(gif)}
									className={cn(
										"absolute top-1 right-1 rounded bg-black/50 p-0.5",
										fav ? "text-yellow-400" : "text-white opacity-0 group-hover:opacity-100",
									)}
								>
									<Star className="size-3" fill={fav ? "currentColor" : "none"} />
								</button>
								{busy === gif.id && (
									<span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] text-white">
										Adding…
									</span>
								)}
							</div>
						);
					})}
				</div>
				{error && <p className="text-destructive py-3 text-center text-xs">{error}</p>}
				{!error && !loading && shown.length === 0 && hasKey && (
					<p className="text-muted-foreground py-6 text-center text-xs">
						{local ? "Nothing here yet." : "No GIFs found."}
					</p>
				)}
				{loading && <p className="text-muted-foreground py-3 text-center text-xs">Loading…</p>}
				{!local && more && !loading && (
					<button
						type="button"
						onClick={() => void load(results.length)}
						className="text-muted-foreground hover:text-foreground w-full py-2 text-xs"
					>
						Load more
					</button>
				)}
			</div>
			<p className="text-muted-foreground text-center text-[10px]" data-giphy-attribution>
				Powered by GIPHY
			</p>
		</div>
	);
}
