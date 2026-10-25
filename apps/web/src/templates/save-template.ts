import type { ParamValues } from "@/params";
import type { TransitionType } from "@/transitions/types";
import type { ProjectTemplate, TemplateAspect, TemplateCategory, TemplateLayer } from "./project-templates";

/*
 * Save project as template: the open project's timeline as a video-template
 * recipe (the same ProjectTemplate the Templates panel builds from), so
 * "Use template" reuses applyTemplate and the media slots are filled from
 * whatever media the new project has. Photo and video clips become media
 * slots (placeholders), text stays editable with its look, and rectangle /
 * ellipse shapes are kept. Audio, effects, animations (Lottie) and other
 * clips aren't part of the recipe.
 */

/** The bits of a timeline clip this reads (structural, so tests need no editor). */
export interface SourceClip {
	id: string;
	type: string;
	name: string;
	startTime: number;
	duration: number;
	params: ParamValues;
	mediaId?: string;
	definitionId?: string;
	lottie?: unknown;
	transitionIn?: { type: TransitionType } | null;
}

export interface SourceTrack {
	type: string;
	elements: SourceClip[];
}

export interface SaveTemplateInput {
	name: string;
	category: TemplateCategory;
	description?: string;
	canvas: { width: number; height: number };
	/** Bottom track first, as the timeline stacks them (main, then overlays). */
	tracks: SourceTrack[];
	ticksPerSecond: number;
	/** Clip ids of photos/videos to leave out (default: every one becomes a slot). */
	exclude?: string[];
	thumbnail?: string;
	now?: number;
}

const PLACEHOLDER_COLORS = ["#334155", "#1E3A8A", "#7C2D12", "#14532D", "#581C87", "#0F766E"];

export function aspectOf({ width, height }: { width: number; height: number }): TemplateAspect {
	const r = width / height;
	const label: TemplateAspect["label"] = r > 1.2 ? "16:9" : r < 0.7 ? "9:16" : r < 0.9 ? "4:5" : "1:1";
	return { label, width, height };
}

/** Media clips of the project (what can become a replaceable slot). */
export function mediaClips(tracks: SourceTrack[]): SourceClip[] {
	return tracks.flatMap((t) => t.elements.filter((e) => (e.type === "video" || e.type === "image") && !!e.mediaId));
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The project as a template recipe; null when nothing in it can be kept. */
export function projectToTemplate(input: SaveTemplateInput): ProjectTemplate | null {
	const { canvas, ticksPerSecond: tps } = input;
	const exclude = new Set(input.exclude ?? []);
	const slots = new Map<string, number>();
	const layers: TemplateLayer[] = [];
	for (const track of input.tracks) {
		for (const e of track.elements) {
			const start = round(e.startTime / tps);
			const duration = round(e.duration / tps);
			if (duration <= 0) continue;
			const p = e.params;
			const x = typeof p["transform.positionX"] === "number" ? round(p["transform.positionX"] / canvas.width) : undefined;
			const y = typeof p["transform.positionY"] === "number" ? round(p["transform.positionY"] / canvas.height) : undefined;
			if ((e.type === "video" || e.type === "image") && e.mediaId) {
				if (exclude.has(e.id)) continue;
				// The same photo/video used twice fills the same slot.
				const slot = slots.get(e.mediaId) ?? slots.size;
				slots.set(e.mediaId, slot);
				layers.push({
					kind: "media",
					slot,
					start,
					duration,
					color: PLACEHOLDER_COLORS[slot % PLACEHOLDER_COLORS.length]!,
					...(e.transitionIn?.type ? { transitionIn: e.transitionIn.type } : {}),
				});
			} else if (e.type === "text" && typeof p.content === "string") {
				const style: ParamValues = {};
				for (const [k, v] of Object.entries(p)) if (k !== "content" && !k.startsWith("transform.position")) style[k] = v;
				layers.push({ kind: "text", content: p.content, style, start, duration, ...(x !== undefined ? { x } : {}), ...(y !== undefined ? { y } : {}) });
			} else if (e.type === "graphic" && (e.definitionId === "rectangle" || e.definitionId === "ellipse") && !e.lottie) {
				const base = Math.min(canvas.width, canvas.height);
				const sx = typeof p["transform.scaleX"] === "number" ? p["transform.scaleX"] : 1;
				const sy = typeof p["transform.scaleY"] === "number" ? p["transform.scaleY"] : 1;
				layers.push({
					kind: "shape",
					definitionId: e.definitionId,
					fill: typeof p.fill === "string" ? p.fill : "#FFFFFF",
					width: round((sx * base) / canvas.width),
					height: round((sy * base) / canvas.height),
					start,
					duration,
					...(x !== undefined ? { x } : {}),
					...(y !== undefined ? { y } : {}),
					...(typeof p.cornerRadius === "number" ? { cornerRadius: p.cornerRadius } : {}),
					...(typeof p.opacity === "number" ? { opacity: p.opacity } : {}),
				});
			}
		}
	}
	if (layers.length === 0) return null;
	const fills = layers.flatMap((l) => (l.kind === "shape" ? [l.fill] : l.kind === "media" ? [l.color] : []));
	return {
		id: `my-${(input.now ?? Date.now()).toString(36)}`,
		name: input.name.trim() || "My template",
		category: input.category,
		aspect: aspectOf(canvas),
		description: input.description?.trim() ?? "",
		palette: [fills[0] ?? "#4C8DFF", fills[1] ?? "#0F172A"],
		layers,
		source: { kind: "user" },
		...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
	};
}

export type TemplateSection = "built-in" | "downloaded" | "mine";

/** Which section of the Templates panel a template is listed in. */
export function templateSection(template: Pick<ProjectTemplate, "source">): TemplateSection {
	if (template.source?.kind === "user") return "mine";
	if (template.source?.kind === "pack") return "downloaded";
	return "built-in";
}

/** Templates of one section, filtered by category chip and search. */
export function filterTemplates<T extends Pick<ProjectTemplate, "source" | "category" | "name" | "description"> & { source?: ProjectTemplate["source"] }>({
	templates,
	section,
	category,
	query,
}: {
	templates: T[];
	section: TemplateSection;
	category: "All" | TemplateCategory;
	query: string;
}): T[] {
	const q = query.trim().toLowerCase();
	return templates.filter(
		(t) =>
			templateSection(t) === section &&
			(category === "All" || t.category === category) &&
			(!q || `${t.name} ${t.description} ${t.source?.kind === "pack" ? t.source.packTitle : ""}`.toLowerCase().includes(q)),
	);
}
