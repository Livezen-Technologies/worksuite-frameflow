import { type ClipEq, getElementEq, hasEq } from "./audio-state";
import type { AudioElement, VideoElement } from "./types";

type AudioCapableElement = AudioElement | VideoElement;

/** One parametric EQ band (AE-05): a peaking filter. */
export interface PeqBand {
	freq: number;
	gain: number;
	q: number;
}

/**
 * Every non-destructive clip effect (AE-04, AE-05). Stored in the clip's
 * params, so it's undoable and heard in the preview and the export.
 */
export interface ClipFx {
	eq: ClipEq;
	bands: PeqBand[];
	/** Clean-up sliders, 0–100 unless noted. */
	noise: number;
	echo: number;
	/** Presence boost at 3.5 kHz, dB (−6…+12). */
	presence: number;
	deess: number;
	comp: number;
	/** Brick-wall limiter at −1 dBFS. */
	limiter: boolean;
}

export const MAX_BANDS = 8;

const num = ({ element, key, min, max, fallback = 0 }: { element: AudioCapableElement; key: string; min: number; max: number; fallback?: number }) => {
	const v = element.params[key];
	return typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
};

export function getElementFx({ element }: { element: AudioCapableElement }): ClipFx {
	const count = num({ element, key: "peq.count", min: 0, max: MAX_BANDS });
	const bands: PeqBand[] = [];
	for (let i = 0; i < count; i++) {
		bands.push({
			freq: num({ element, key: `peq.${i}.f`, min: 20, max: 20000, fallback: 1000 }),
			gain: num({ element, key: `peq.${i}.g`, min: -18, max: 18 }),
			q: num({ element, key: `peq.${i}.q`, min: 0.2, max: 12, fallback: 1 }),
		});
	}
	return {
		eq: getElementEq({ element }),
		bands,
		noise: num({ element, key: "fx.noise", min: 0, max: 100 }),
		echo: num({ element, key: "fx.echo", min: 0, max: 100 }),
		presence: num({ element, key: "fx.presence", min: -6, max: 12 }),
		deess: num({ element, key: "fx.deess", min: 0, max: 100 }),
		comp: num({ element, key: "fx.comp", min: 0, max: 100 }),
		limiter: element.params["fx.limiter"] === true,
	};
}

export function hasFx(fx: ClipFx): boolean {
	return (
		hasEq(fx.eq) ||
		fx.bands.some((b) => b.gain !== 0) ||
		fx.noise > 0 ||
		fx.echo > 0 ||
		fx.presence !== 0 ||
		fx.deess > 0 ||
		fx.comp > 0 ||
		fx.limiter
	);
}

/** The params patch that stores the given effects. */
export function fxParams(fx: Partial<ClipFx>): Record<string, number | boolean> {
	const out: Record<string, number | boolean> = {};
	if (fx.eq) {
		out["eq.low"] = fx.eq.low;
		out["eq.mid"] = fx.eq.mid;
		out["eq.high"] = fx.eq.high;
		out["eq.lowCut"] = fx.eq.lowCut;
	}
	if (fx.bands) {
		out["peq.count"] = fx.bands.length;
		fx.bands.forEach((b, i) => {
			out[`peq.${i}.f`] = Math.round(b.freq);
			out[`peq.${i}.g`] = Math.round(b.gain * 10) / 10;
			out[`peq.${i}.q`] = Math.round(b.q * 100) / 100;
		});
	}
	for (const key of ["noise", "echo", "presence", "deess", "comp"] as const) {
		if (fx[key] !== undefined) out[`fx.${key}`] = fx[key];
	}
	if (fx.limiter !== undefined) out["fx.limiter"] = fx.limiter;
	return out;
}

/** Clean up voice presets (AE-04). */
export const CLEANUP_PRESETS: { id: string; label: string; fx: Pick<ClipFx, "noise" | "echo" | "presence" | "deess" | "comp"> & { lowCut: number } }[] = [
	{ id: "podcast", label: "Podcast", fx: { noise: 30, echo: 10, presence: 3, deess: 40, comp: 45, lowCut: 80 } },
	{ id: "call", label: "Phone / Zoom call", fx: { noise: 55, echo: 30, presence: 5, deess: 30, comp: 60, lowCut: 120 } },
	{ id: "street", label: "Noisy street", fx: { noise: 80, echo: 10, presence: 4, deess: 20, comp: 50, lowCut: 150 } },
	{ id: "room", label: "Room echo", fx: { noise: 25, echo: 70, presence: 2, deess: 20, comp: 35, lowCut: 100 } },
	{ id: "narration", label: "Narration", fx: { noise: 20, echo: 15, presence: 2, deess: 50, comp: 55, lowCut: 70 } },
];
