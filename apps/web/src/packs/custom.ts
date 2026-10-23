"use client";

/**
 * Custom and team packs (SRS SP-11): the user's own packs, made from titles
 * and shapes placed in a project, saved on this device, exported as a
 * `.ffpack.json` file and shared through the team asset library.
 */
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ParamValues } from "@/params";
import type { TimelineElement } from "@/timeline";
import { SIZE_UNIT, TEXT_SCALE, safeArea } from "./compile";
import type { AspectId, Pack, PackLayer, PackTemplate } from "./types";

export const PACK_FILE_SUFFIX = ".ffpack.json";
const FORMAT = "frameflow-pack";

/** Text params that belong to the look, not the words or the placement. */
const SKIP_TEXT = new Set(["content", "transform.positionX", "transform.positionY", "transform.scaleX", "transform.scaleY", "transform.rotate", "fontSize", "color"]);

export function newPack({ name }: { name: string }): Pack {
	return {
		id: `custom-${crypto.randomUUID().slice(0, 8)}`,
		name: name.trim() || "My pack",
		description: "Your own templates.",
		aspects: ["16:9", "9:16", "1:1", "4:5"],
		safe: {},
		palette: { primary: "#3B82F6", accent: "#F59E0B", dark: "#111827", light: "#FFFFFF" },
		fonts: { heading: "Inter", body: "Inter" },
		templates: [],
	};
}

const num = ({ v, fallback }: { v: unknown; fallback: number }) =>
	typeof v === "number" && Number.isFinite(v) ? v : fallback;

const isHex = (v: unknown): v is `#${string}` => typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v);

/**
 * The selected titles and shapes as a pack template: positions relative to
 * the safe area, sizes relative to the frame, so it re-flows to other
 * aspects like the built-in packs.
 */
export function templateFromElements({
	elements,
	frame,
	ticksPerSecond,
	pack,
	name,
	aspect,
}: {
	elements: TimelineElement[];
	frame: { width: number; height: number };
	ticksPerSecond: number;
	pack: Pack;
	name: string;
	aspect: AspectId;
}): PackTemplate | null {
	const usable = elements
		.filter((element) => element.type === "text" || element.type === "graphic")
		.map((element) => ({ element }));
	if (usable.length === 0) return null;
	const safe = safeArea({ pack, aspect });
	const sw = 1 - safe.left - safe.right;
	const sh = 1 - safe.top - safe.bottom;
	const base = Math.min(frame.width, frame.height);
	const start = Math.min(...usable.map(({ element }) => element.startTime));
	const layers: PackLayer[] = [];
	for (const { element } of usable) {
		const p = element.params;
		const timing = {
			start: (element.startTime - start) / ticksPerSecond,
			duration: element.duration / ticksPerSecond,
			// Centre-anchored, nudged by the clip's offset from the centre.
			anchor: "c" as const,
			dx: num({ v: p["transform.positionX"], fallback: 0 }) / frame.width / sw,
			dy: num({ v: p["transform.positionY"], fallback: 0 }) / frame.height / sh,
		};
		if (element.type === "text") {
			const content = String(p.content ?? "");
			const style: ParamValues = Object.fromEntries(Object.entries(p).filter(([k]) => !SKIP_TEXT.has(k)));
			layers.push({
				kind: "text",
				text: { en: content, si: content, mixed: content },
				size: num({ v: p.fontSize, fallback: 15 }) / SIZE_UNIT / TEXT_SCALE[aspect],
				color: isHex(p.color) ? p.color : "#FFFFFF",
				style,
				w: 0.9,
				h: 0.12,
				...timing,
			});
		} else if (element.type === "graphic" && (element.definitionId === "rectangle" || element.definitionId === "ellipse")) {
			const fill = isHex(p.fill) ? p.fill : "#000000";
			layers.push({
				kind: "shape",
				shape: element.definitionId,
				color: fill,
				radius: num({ v: p.cornerRadius, fallback: 0 }),
				opacity: num({ v: p.opacity, fallback: 1 }),
				w: (num({ v: p["transform.scaleX"], fallback: 1 }) * base) / frame.width / sw,
				h: (num({ v: p["transform.scaleY"], fallback: 1 }) * base) / frame.height / sh,
				...timing,
			});
		}
	}
	if (layers.length === 0) return null;
	return {
		id: `t-${crypto.randomUUID().slice(0, 8)}`,
		name: name.trim() || "My template",
		purpose: "title",
		layers,
	};
}

const PackSchema = z.object({
	format: z.literal(FORMAT),
	version: z.literal(1),
	pack: z.object({
		id: z.string().startsWith("custom-"),
		name: z.string().max(80),
		description: z.string().max(400),
		aspects: z.array(z.enum(["16:9", "9:16", "1:1", "4:5"])).min(1),
		safe: z.record(z.string(), z.object({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() })),
		palette: z.object({ primary: z.string(), accent: z.string(), dark: z.string(), light: z.string() }),
		fonts: z.object({ heading: z.string(), body: z.string() }),
		templates: z.array(z.object({ id: z.string(), name: z.string(), purpose: z.string(), layers: z.array(z.record(z.string(), z.unknown())) })).max(200),
	}),
});

const PURPOSES = ["intro", "title", "lower-third", "call-to-action", "captions", "end-screen", "promo"] as const;
const isPurpose = (v: string): v is PackTemplate["purpose"] => PURPOSES.some((p) => p === v);
const isAspect = (v: string): v is AspectId => ["16:9", "9:16", "1:1", "4:5"].includes(v);
const ANCHORS = ["tl", "t", "tr", "l", "c", "r", "bl", "b", "br"];

function isPackLayer(l: Record<string, unknown>): l is PackLayer & Record<string, unknown> {
	const placed =
		typeof l.anchor === "string" && ANCHORS.includes(l.anchor) &&
		typeof l.w === "number" && typeof l.h === "number" &&
		typeof l.start === "number" && typeof l.duration === "number";
	if (!placed) return false;
	if (l.kind === "text") return typeof l.text === "object" && l.text !== null && typeof l.size === "number" && typeof l.color === "string";
	if (l.kind === "shape") return (l.shape === "rectangle" || l.shape === "ellipse") && typeof l.color === "string";
	if (l.kind === "media") return typeof l.slot === "number" && typeof l.color === "string";
	return l.kind === "logo";
}

export function packToFile({ pack }: { pack: Pack }): File {
	const name = `${pack.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "pack"}${PACK_FILE_SUFFIX}`;
	return new File([JSON.stringify({ format: FORMAT, version: 1, pack }, null, 1)], name, { type: "application/json" });
}

/** Reads a pack file, checking its shape; throws with a reason. */
export function parsePackFile({ text }: { text: string }): Pack {
	const parsed = PackSchema.safeParse(JSON.parse(text));
	if (!parsed.success) throw new Error("This isn't a FrameFlow pack file.");
	const { pack } = parsed.data;
	return {
		...pack,
		id: `custom-${pack.id.slice("custom-".length)}`,
		safe: Object.fromEntries(Object.entries(pack.safe).filter(([k]) => isAspect(k))),
		templates: pack.templates.map((t) => ({
			id: t.id,
			name: t.name,
			purpose: isPurpose(t.purpose) ? t.purpose : "title",
			// Layers were written by FrameFlow; anything unrecognised is dropped.
			layers: t.layers.filter(isPackLayer),
		})),
	};
}

interface CustomPacksStore {
	packs: Pack[];
	add: (pack: Pack) => void;
	addTemplate: (args: { packId: string; template: PackTemplate }) => void;
	removeTemplate: (args: { packId: string; templateId: string }) => void;
	remove: (packId: string) => void;
}

export const useCustomPacks = create<CustomPacksStore>()(
	persist(
		(set) => ({
			packs: [],
			// Same id again (a re-import or a team update) replaces the old copy.
			add: (pack) => set((s) => ({ packs: [...s.packs.filter((p) => p.id !== pack.id), pack] })),
			addTemplate: ({ packId, template }) =>
				set((s) => ({
					packs: s.packs.map((p) => (p.id === packId ? { ...p, templates: [...p.templates, template] } : p)),
				})),
			removeTemplate: ({ packId, templateId }) =>
				set((s) => ({
					packs: s.packs.map((p) =>
						p.id === packId ? { ...p, templates: p.templates.filter((t) => t.id !== templateId) } : p,
					),
				})),
			remove: (packId) => set((s) => ({ packs: s.packs.filter((p) => p.id !== packId) })),
		}),
		{ name: "frameflow-custom-packs" },
	),
);
