"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";

/**
 * GIPHY search for the Elements panel. The key comes from
 * NEXT_PUBLIC_GIPHY_API_KEY at build time, or one pasted into the panel
 * (kept on this device). Results are rated G. GIPHY's terms ask for the
 * "Powered by GIPHY" mark wherever results are shown.
 */

export type GifKind = "gifs" | "stickers";

export interface GifResult {
	id: string;
	title: string;
	kind: GifKind;
	/** Small animated preview for the grid. */
	preview: string;
	/** Full-size file inserted into the project. */
	original: string;
	width: number;
	height: number;
}

export const GIF_CATEGORIES = [
	{ id: "trending", label: "Trending", query: null },
	{ id: "reactions", label: "Reactions", query: "reaction" },
	{ id: "business", label: "Business", query: "business office" },
	{ id: "social", label: "Social Media", query: "subscribe like follow" },
	{ id: "education", label: "Education", query: "school learning" },
	{ id: "effects", label: "Effects", query: "sparkle effect" },
	{ id: "emoji", label: "Emoji", query: "emoji" },
] as const;

export type GifCategoryId = (typeof GIF_CATEGORIES)[number]["id"] | "favorites" | "recent";

interface GifLibraryState {
	apiKey: string;
	favorites: GifResult[];
	recent: GifResult[];
	setApiKey: (key: string) => void;
	toggleFavorite: (gif: GifResult) => void;
	markUsed: (gif: GifResult) => void;
}

export const useGifLibrary = create<GifLibraryState>()(
	persist(
		(set) => ({
			apiKey: "",
			favorites: [],
			recent: [],
			setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
			toggleFavorite: (gif) =>
				set((s) => ({
					favorites: s.favorites.some((f) => f.id === gif.id)
						? s.favorites.filter((f) => f.id !== gif.id)
						: [gif, ...s.favorites].slice(0, 200),
				})),
			markUsed: (gif) =>
				set((s) => ({ recent: [gif, ...s.recent.filter((r) => r.id !== gif.id)].slice(0, 40) })),
		}),
		{ name: "frameflow-gif-library" },
	),
);

export function giphyKey(): string {
	return useGifLibrary.getState().apiKey || process.env.NEXT_PUBLIC_GIPHY_API_KEY || "";
}

const giphyImage = z.object({
	url: z.string().optional(),
	webp: z.string().optional(),
	width: z.string().optional(),
	height: z.string().optional(),
});
const giphyItem = z.object({
	id: z.string(),
	title: z.string().optional(),
	images: z.record(z.string(), giphyImage.optional()),
});
type GiphyItem = z.infer<typeof giphyItem>;
const searchResponse = z.object({
	data: z.array(giphyItem),
	pagination: z.object({ total_count: z.number(), count: z.number(), offset: z.number() }).optional(),
});
const tagsResponse = z.object({ data: z.array(z.object({ name: z.string() })) });

export function parseGiphyItem({ item, kind }: { item: GiphyItem; kind: GifKind }): GifResult | null {
	const original = item.images.original;
	const preview = item.images.fixed_width_small ?? item.images.fixed_width ?? original;
	const file = original?.webp ?? original?.url;
	const thumb = preview?.webp ?? preview?.url;
	if (!file || !thumb) return null;
	return {
		id: `${kind}:${item.id}`,
		title: item.title?.trim() || "GIF",
		kind,
		preview: thumb,
		original: file,
		width: Number(original?.width) || 0,
		height: Number(original?.height) || 0,
	};
}

async function call({ path, params, signal }: { path: string; params: Record<string, string>; signal?: AbortSignal }): Promise<unknown> {
	const key = giphyKey();
	if (!key) throw new Error("Add a GIPHY API key to search GIFs.");
	const url = new URL(`https://api.giphy.com/v1/${path}`);
	url.searchParams.set("api_key", key);
	url.searchParams.set("rating", "g");
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	const response = await fetch(url, { signal });
	if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "GIPHY rejected the API key." : `GIPHY error ${response.status}`);
	return response.json();
}

/** Search (or trending when `query` is empty). */
export async function searchGifs({
	query,
	kind,
	offset = 0,
	signal,
}: {
	query: string | null;
	kind: GifKind;
	offset?: number;
	signal?: AbortSignal;
}): Promise<{ results: GifResult[]; more: boolean }> {
	const q = query?.trim();
	const body = searchResponse.parse(await call({
		path: q ? `${kind}/search` : `${kind}/trending`,
		params: { limit: "36", offset: String(offset), ...(q ? { q } : {}) },
		signal,
	}));
	const results = body.data.flatMap((item) => parseGiphyItem({ item, kind }) ?? []);
	const p = body.pagination;
	return { results, more: p ? p.offset + p.count < p.total_count : false };
}

/** Search suggestions for a partial query. */
export async function gifSuggestions({ query, signal }: { query: string; signal?: AbortSignal }): Promise<string[]> {
	if (!query.trim()) return [];
	const body = tagsResponse.parse(
		await call({ path: "gifs/search/tags", params: { q: query.trim(), limit: "6" }, signal }),
	);
	return body.data.map((d) => d.name);
}

/** Downloads a result as a File ready for the media bin. */
export async function downloadGif(gif: GifResult): Promise<File> {
	const response = await fetch(gif.original);
	if (!response.ok) throw new Error(`Download failed (${response.status})`);
	const blob = await response.blob();
	const type = blob.type || (gif.original.includes(".webp") ? "image/webp" : "image/gif");
	const ext = type === "image/webp" ? "webp" : "gif";
	const name = `${gif.title.replace(/[^\w\- ]+/g, "").slice(0, 40).trim() || "gif"}.${ext}`;
	return new File([blob], name, { type });
}
