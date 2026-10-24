import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { LottieJson } from "../types";

/**
 * dotLottie (.lottie) reader and writer.
 *
 * Reads both layouts: v1 (manifest `version: "1"`, `animations/`,
 * `images/`) and v2 (manifest `version: "2"`, `a/`, `i/`, `t/` themes),
 * plus mixed archives some tools write (v2 manifest, v1 folders).
 * Writes v2 (`a/`, `i/`, `t/`) as in the dotLottie 2.0 spec, with images
 * pulled out of the JSON into `i/` and colour slots as a theme.
 */

export interface DotLottieTheme {
	id: string;
	/** dotLottie 2 theme rules: slot id → value. */
	rules: Array<{ id: string; type: "Color" | "Scalar" | "Text" | "Image" | "Vector" | "Position" | "Gradient"; value: unknown }>;
}

export interface DotLottieAnimation {
	id: string;
	name?: string;
	/** Images inlined as data URLs, so the JSON stands alone. */
	json: LottieJson;
}

export interface DotLottie {
	version: 1 | 2;
	generator?: string;
	animations: DotLottieAnimation[];
	themes: DotLottieTheme[];
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
	const binary = atob(b64);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

function parseJson(bytes: Uint8Array | undefined): unknown {
	if (!bytes) return null;
	try {
		return JSON.parse(strFromU8(bytes));
	} catch {
		return null;
	}
}

/** Reads a .lottie archive. Throws when there's no animation in it. */
export function readDotLottie(bytes: Uint8Array): DotLottie {
	const files = unzipSync(bytes);
	const manifest = (parseJson(files["manifest.json"]) ?? {}) as {
		version?: string;
		generator?: string;
		animations?: Array<{ id?: string; name?: string }>;
		themes?: Array<{ id?: string } | string>;
	};
	const paths = Object.keys(files);
	const isV2 = String(manifest.version ?? "").startsWith("2") || paths.some((p) => p.startsWith("a/"));
	const animDirs = ["a/", "animations/"];
	const imageDirs = ["i/", "images/"];
	const themeDirs = ["t/", "themes/"];
	const findIn = (dirs: string[], name: string) => dirs.map((d) => `${d}${name}`).find((p) => files[p]);

	const listed = (manifest.animations ?? []).map((a) => ({ id: a.id ?? "", name: a.name })).filter((a) => a.id);
	const ids = listed.length
		? listed
		: paths.filter((p) => /^(a|animations)\/[^/]+\.json$/.test(p)).map((p) => ({ id: p.replace(/^.*\/|\.json$/g, ""), name: undefined as string | undefined }));

	const animations: DotLottieAnimation[] = [];
	for (const { id, name } of ids) {
		const path = findIn(animDirs, `${id}.json`);
		const json = parseJson(path ? files[path] : undefined) as LottieJson | null;
		if (!json || typeof json !== "object" || !Array.isArray(json.layers)) continue;
		for (const asset of (json.assets ?? []) as Array<Record<string, unknown>>) {
			const file = typeof asset.p === "string" ? asset.p : null;
			if (!file || asset.e === 1 || file.startsWith("data:")) continue;
			const imagePath = findIn(imageDirs, file);
			if (!imagePath) continue;
			const ext = file.split(".").pop()?.toLowerCase() ?? "png";
			Object.assign(asset, { p: `data:${MIME[ext] ?? "image/png"};base64,${toBase64(files[imagePath]!)}`, u: "", e: 1 });
		}
		animations.push({ id, ...(name ? { name } : {}), json });
	}
	if (animations.length === 0) throw new Error("This .lottie file has no animation in it.");

	const themeIds = new Set<string>();
	for (const t of manifest.themes ?? []) themeIds.add(typeof t === "string" ? t : (t.id ?? ""));
	for (const p of paths) {
		const m = /^(t|themes)\/([^/]+)\.json$/.exec(p);
		if (m) themeIds.add(m[2]!);
	}
	const themes: DotLottieTheme[] = [];
	for (const id of themeIds) {
		if (!id) continue;
		const path = findIn(themeDirs, `${id}.json`);
		const data = parseJson(path ? files[path] : undefined) as { rules?: DotLottieTheme["rules"] } | null;
		if (data?.rules) themes.push({ id, rules: data.rules });
	}
	return { version: isV2 ? 2 : 1, ...(manifest.generator ? { generator: manifest.generator } : {}), animations, themes };
}

/**
 * Colour slots: adds `sid` to static solid fills/strokes whose colour is in
 * `colors` (#RRGGBB → slot id) and a `slots` table with the default values.
 * Returns a copy; lottie players without slot support ignore both.
 */
export function addColorSlots(json: LottieJson, colors: Record<string, string>): LottieJson {
	const toHex = (k: unknown) => {
		if (!Array.isArray(k) || k.length < 3 || typeof k[0] !== "number") return null;
		return `#${(k as number[])
			.slice(0, 3)
			.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0"))
			.join("")}`.toUpperCase();
	};
	const slots: Record<string, { p: { a: 0; k: number[] } }> = {};
	const walk = (node: unknown): unknown => {
		if (Array.isArray(node)) return node.map(walk);
		if (!node || typeof node !== "object") return node;
		const out: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(node)) out[key] = walk(value);
		if ((out.ty === "fl" || out.ty === "st") && out.c && typeof out.c === "object") {
			const c = out.c as { a?: number; k?: unknown };
			const hex = c.a ? null : toHex(c.k);
			const sid = hex ? colors[hex] : undefined;
			if (sid) {
				out.c = { ...c, sid };
				slots[sid] = { p: { a: 0, k: c.k as number[] } };
			}
		}
		return out;
	};
	const next = walk(json) as LottieJson;
	if (Object.keys(slots).length) next.slots = { ...((json.slots as object) ?? {}), ...slots };
	return next;
}

export interface WriteDotLottieOptions {
	animations: Array<{ id: string; name?: string; json: LottieJson }>;
	/** Colour slot themes (slot id → #RRGGBB). */
	themes?: Array<{ id: string; colors: Record<string, string> }>;
	generator?: string;
}

const hexToRgba = (hex: string): number[] => {
	const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
};

/** Writes a dotLottie v2 archive (deterministic bytes for the same input). */
export function writeDotLottie({ animations, themes = [], generator = "Worksuite FrameFlow" }: WriteDotLottieOptions): Uint8Array {
	const files: Record<string, Uint8Array> = {};
	const fixed = { mtime: new Date(1980, 0, 1) };
	for (const anim of animations) {
		const json = structuredClone(anim.json) as LottieJson;
		let n = 0;
		for (const asset of (json.assets ?? []) as Array<Record<string, unknown>>) {
			const p = typeof asset.p === "string" ? asset.p : "";
			const m = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,([\s\S]*)$/.exec(p);
			if (!m) continue;
			const ext = m[1] === "jpeg" ? "jpg" : m[1] === "svg+xml" ? "svg" : m[1]!;
			const name = `${anim.id}_${String(asset.id ?? n++).replace(/[^\w-]/g, "_")}.${ext}`;
			files[`i/${name}`] = fromBase64(m[2]!);
			Object.assign(asset, { p: name, u: "/i/", e: 0 });
		}
		files[`a/${anim.id}.json`] = strToU8(JSON.stringify(json));
	}
	for (const theme of themes) {
		const rules = Object.entries(theme.colors).map(([id, hex]) => ({ id, type: "Color" as const, value: hexToRgba(hex) }));
		files[`t/${theme.id}.json`] = strToU8(JSON.stringify({ rules }));
	}
	const manifest = {
		version: "2",
		generator,
		animations: animations.map((a) => ({ id: a.id, ...(a.name ? { name: a.name } : {}) })),
		...(themes.length ? { themes: themes.map((t) => ({ id: t.id })) } : {}),
	};
	const ordered: Record<string, [Uint8Array, typeof fixed]> = { "manifest.json": [strToU8(JSON.stringify(manifest)), fixed] };
	for (const key of Object.keys(files).sort()) ordered[key] = [files[key]!, fixed];
	return zipSync(ordered, { level: 6 });
}

/** A v1 archive (for tests and old players): manifest version "1", animations/, images/. */
export function writeDotLottieV1({ animations }: { animations: Array<{ id: string; json: LottieJson }> }): Uint8Array {
	const out: Record<string, Uint8Array> = {
		"manifest.json": strToU8(JSON.stringify({ version: "1", generator: "Worksuite FrameFlow", animations: animations.map((a) => ({ id: a.id })) })),
	};
	for (const a of animations) out[`animations/${a.id}.json`] = strToU8(JSON.stringify(a.json));
	return zipSync(out);
}
