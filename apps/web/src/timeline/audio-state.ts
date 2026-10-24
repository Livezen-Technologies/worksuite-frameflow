import { hasKeyframesForPath } from "@/animation/keyframe-query";
import { resolveNumberAtTime } from "@/animation/values";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "./audio-constants";
import type { TimelineElement } from "./types";
const DEFAULT_STEP_SECONDS = 1 / 60;

export type AudioCapableElement = Extract<
	TimelineElement,
	{ type: "audio" | "video" }
>;

export function clampDb(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.min(VOLUME_DB_MAX, Math.max(VOLUME_DB_MIN, value));
}

export function dBToLinear(db: number): number {
	return 10 ** (clampDb(db) / 20);
}

export function getElementVolume({
	element,
}: {
	element: AudioCapableElement;
}): number {
	const value = element.params.volume;
	return typeof value === "number" ? value : 0;
}

export function isElementMuted({
	element,
}: {
	element: AudioCapableElement;
}): boolean {
	return element.params.muted === true;
}

/** Fade-in and fade-out lengths in seconds (Audio › Basic). */
export function getElementFades({ element }: { element: AudioCapableElement }): {
	fadeIn: number;
	fadeOut: number;
} {
	const read = (key: string) => {
		const value = element.params[key];
		return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
	};
	return { fadeIn: read("fadeIn"), fadeOut: read("fadeOut") };
}

/** Voice changer pitch in semitones; 0 leaves the voice as it is. */
export function getElementPitch({ element }: { element: AudioCapableElement }): number {
	const value = element.params.voicePitch;
	return typeof value === "number" && Number.isFinite(value) ? Math.max(-12, Math.min(12, value)) : 0;
}

/** 3-band equaliser in dB (Audio Studio › EQ): low shelf, mid peak, high shelf. */
export interface ClipEq {
	low: number;
	mid: number;
	high: number;
	/** High-pass cut-off in Hz (0 = off), for rumble or a "telephone" sound. */
	lowCut: number;
}

export function getElementEq({ element }: { element: AudioCapableElement }): ClipEq {
	const read = ({ key, min, max }: { key: string; min: number; max: number }) => {
		const value = element.params[key];
		return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
	};
	return {
		low: read({ key: "eq.low", min: -24, max: 24 }),
		mid: read({ key: "eq.mid", min: -24, max: 24 }),
		high: read({ key: "eq.high", min: -24, max: 24 }),
		lowCut: read({ key: "eq.lowCut", min: 0, max: 2000 }),
	};
}

export function hasEq(eq: ClipEq): boolean {
	return eq.low !== 0 || eq.mid !== 0 || eq.high !== 0 || eq.lowCut > 0;
}

/** Volume changes over the clip: keyframes or fades. */
export function hasAnimatedVolume({
	element,
}: {
	element: AudioCapableElement;
}): boolean {
	const { fadeIn, fadeOut } = getElementFades({ element });
	return (
		fadeIn > 0 ||
		fadeOut > 0 ||
		hasKeyframesForPath({
			animations: element.animations,
			propertyPath: "volume",
		})
	);
}

import { TICKS_PER_SECOND } from "@/wasm";

export function resolveEffectiveAudioGain({
	element,
	trackMuted = false,
	localTime,
}: {
	element: AudioCapableElement;
	trackMuted?: boolean;
	localTime: number;
}): number {
	if (trackMuted || isElementMuted({ element })) {
		return 0;
	}

	const resolvedDb = resolveNumberAtTime({
		baseValue: getElementVolume({ element }),
		animations: element.animations,
		propertyPath: "volume",
		localTime: Math.round(localTime * TICKS_PER_SECOND),
	});

	return dBToLinear(resolvedDb) * fadeGain({ element, localTime });
}

/** 0–1 ramp for the fades, on the clip's own time (seconds). */
function fadeGain({ element, localTime }: { element: AudioCapableElement; localTime: number }): number {
	const { fadeIn, fadeOut } = getElementFades({ element });
	if (fadeIn <= 0 && fadeOut <= 0) return 1;
	const duration = element.duration / TICKS_PER_SECOND;
	let gain = 1;
	if (fadeIn > 0) gain = Math.min(gain, Math.max(0, localTime / fadeIn));
	if (fadeOut > 0) gain = Math.min(gain, Math.max(0, (duration - localTime) / fadeOut));
	return gain;
}

export function buildWaveformGainSamples({
	element,
	count,
}: {
	element: AudioCapableElement;
	count: number;
}): number[] {
	const durationSeconds = element.duration / TICKS_PER_SECOND;
	return Array.from({ length: count }, (_, i) => {
		const localTime = ((i + 0.5) / count) * durationSeconds;
		return resolveEffectiveAudioGain({ element, localTime });
	});
}

export function buildAudioGainAutomation({
	element,
	trackMuted = false,
	fromLocalTime,
	toLocalTime,
	stepSeconds = DEFAULT_STEP_SECONDS,
}: {
	element: AudioCapableElement;
	trackMuted?: boolean;
	fromLocalTime: number;
	toLocalTime: number;
	stepSeconds?: number;
}): Array<{ localTime: number; gain: number }> {
	const startTime = Math.max(0, fromLocalTime);
	const endTime = Math.max(startTime, toLocalTime);
	const safeStep =
		Number.isFinite(stepSeconds) && stepSeconds > 0
			? stepSeconds
			: DEFAULT_STEP_SECONDS;
	const points: Array<{ localTime: number; gain: number }> = [];

	for (let localTime = startTime; localTime < endTime; localTime += safeStep) {
		points.push({
			localTime,
			gain: resolveEffectiveAudioGain({
				element,
				trackMuted,
				localTime,
			}),
		});
	}

	points.push({
		localTime: endTime,
		gain: resolveEffectiveAudioGain({
			element,
			trackMuted,
			localTime: endTime,
		}),
	});

	return points;
}
