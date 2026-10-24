import type { LottieColorSlot, LottieJson } from "./types";

/** "#abc", "#AABBCC" or "#AABBCCDD" → "#AABBCC"; null when it isn't a colour. */
export function normalizeHex(value: string): string | null {
	const match = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
	if (!match) return null;
	let hex = match[1];
	if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
	return `#${hex.slice(0, 6).toUpperCase()}`;
}

export function hexToRgb01(hex: string): [number, number, number] {
	const normal = normalizeHex(hex) ?? "#000000";
	const n = Number.parseInt(normal.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgb01ToHex(rgb: ArrayLike<number>): string {
	// Some exporters write 0–255 instead of 0–1.
	const scale = rgb[0] > 1 || rgb[1] > 1 || rgb[2] > 1 ? 1 : 255;
	const part = (v: number) =>
		Math.max(0, Math.min(255, Math.round(v * scale)))
			.toString(16)
			.padStart(2, "0");
	return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`.toUpperCase();
}

type ColorProp = { a?: number; k?: unknown };

function isColorArray(value: unknown): value is number[] {
	return (
		Array.isArray(value) &&
		value.length >= 3 &&
		value.slice(0, 3).every((v) => typeof v === "number")
	);
}

/**
 * Visits every fill and stroke colour in the document: static values and the
 * values of keyframed colours alike. `visit` may return a replacement.
 */
function walkColors(
	node: unknown,
	visit: (rgb: number[]) => number[] | undefined,
): void {
	if (Array.isArray(node)) {
		for (const item of node) walkColors(item, visit);
		return;
	}
	if (!node || typeof node !== "object") return;
	const record = node as Record<string, unknown>;
	if ((record.ty === "fl" || record.ty === "st") && record.c) {
		const prop = record.c as ColorProp;
		if (prop.a === 1 && Array.isArray(prop.k)) {
			for (const key of prop.k as Record<string, unknown>[]) {
				for (const field of ["s", "e"] as const) {
					if (isColorArray(key?.[field])) {
						const next = visit(key[field] as number[]);
						if (next) key[field] = next;
					}
				}
			}
		} else if (isColorArray(prop.k)) {
			const next = visit(prop.k);
			if (next) prop.k = next;
		}
	}
	// Solid layers carry their colour as a hex string.
	if (record.ty === 1 && typeof record.sc === "string") {
		const hex = normalizeHex(record.sc);
		if (hex) {
			const next = visit([...hexToRgb01(hex), 1]);
			if (next) record.sc = rgb01ToHex(next).toLowerCase();
		}
	}
	for (const value of Object.values(record)) {
		if (value && typeof value === "object") walkColors(value, visit);
	}
}

/** Distinct fill/stroke colours in a Lottie, most used first. */
export function collectLottieColors(json: LottieJson): string[] {
	const counts = new Map<string, number>();
	walkColors(json, (rgb) => {
		const hex = rgb01ToHex(rgb);
		counts.set(hex, (counts.get(hex) ?? 0) + 1);
		return undefined;
	});
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([hex]) => hex);
}

/** Colour slots for a Lottie that has no metadata (a user's own file). */
export function detectColorSlots(
	json: LottieJson,
	max = 8,
): LottieColorSlot[] {
	return collectLottieColors(json)
		.slice(0, max)
		.map((hex, index) => ({
			id: `color${index + 1}`,
			name: `Colour ${index + 1}`,
			default: hex,
		}));
}

/** Only real changes, keyed by normalised authored colour. */
export function normalizeColorMap(
	colors: Record<string, string>,
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [from, to] of Object.entries(colors)) {
		const a = normalizeHex(from);
		const b = normalizeHex(to);
		if (a && b && a !== b) result[a] = b;
	}
	return result;
}

/** A recoloured deep copy; the input is left as it was. */
export function recolorLottie(
	json: LottieJson,
	colors: Record<string, string>,
): LottieJson {
	const copy = structuredClone(json);
	const map = normalizeColorMap(colors);
	if (Object.keys(map).length === 0) return copy;
	walkColors(copy, (rgb) => {
		const to = map[rgb01ToHex(rgb)];
		if (!to) return undefined;
		const alpha = rgb.length > 3 ? rgb.slice(3) : [];
		return [...hexToRgb01(to), ...alpha];
	});
	return copy;
}

/** True when any layer, at any depth, is a text layer (ty 5). */
export function hasTextLayers(json: LottieJson): boolean {
	const layerLists: unknown[][] = [json.layers ?? []];
	for (const asset of (json.assets ?? []) as { layers?: unknown[] }[]) {
		if (Array.isArray(asset?.layers)) layerLists.push(asset.layers);
	}
	return layerLists.some((layers) =>
		layers.some((layer) => (layer as { ty?: number })?.ty === 5),
	);
}

/** Basic shape check for a file that claims to be a Lottie. */
export function parseLottie(text: string): LottieJson {
	const json = JSON.parse(text) as Partial<LottieJson>;
	const ok =
		json &&
		typeof json === "object" &&
		typeof json.fr === "number" &&
		json.fr > 0 &&
		typeof json.ip === "number" &&
		typeof json.op === "number" &&
		json.op > json.ip &&
		typeof json.w === "number" &&
		typeof json.h === "number" &&
		Array.isArray(json.layers);
	if (!ok) throw new Error("This JSON file isn't a Lottie animation.");
	return json as LottieJson;
}
