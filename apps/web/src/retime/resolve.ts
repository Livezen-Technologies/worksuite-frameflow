import type { RetimeConfig } from "@/timeline";
import { clampRetimeRate } from "@/retime/rate";
import { curveClipTime, curveSourceTime, speedAtClipFraction } from "./curve";

function getSafeRate({ rate }: { rate: number }): number {
	return clampRetimeRate({ rate });
}

/**
 * Source time (from trim start) shown at `clipTime`. Pass the clip's
 * `duration` (same unit) so a speed curve maps exactly; without it a curve
 * falls back to its average speed.
 */
export function getSourceTimeAtClipTime({
	clipTime,
	retime,
	duration,
}: {
	clipTime: number;
	retime?: RetimeConfig;
	duration?: number;
}): number {
	if (retime?.curve?.length && duration && duration > 0) {
		return curveSourceTime({ keyframes: retime.curve, clipTime, duration });
	}
	return clipTime * getSafeRate({ rate: retime?.rate ?? 1 });
}

export function getClipTimeAtSourceTime({
	sourceTime,
	retime,
	duration,
}: {
	sourceTime: number;
	retime?: RetimeConfig;
	duration?: number;
}): number {
	if (retime?.curve?.length && duration && duration > 0) {
		return curveClipTime({ keyframes: retime.curve, sourceTime, duration });
	}
	return sourceTime / getSafeRate({ rate: retime?.rate ?? 1 });
}

export function getEffectiveRateAt({
	clipTime,
	retime,
	duration,
}: {
	clipTime?: number;
	retime?: RetimeConfig;
	duration?: number;
}): number {
	if (retime?.curve?.length && duration && duration > 0 && clipTime !== undefined) {
		return speedAtClipFraction({ keyframes: retime.curve, u: clipTime / duration });
	}
	return getSafeRate({ rate: retime?.rate ?? 1 });
}

export function getTimelineDurationForSourceSpan({
	sourceSpan,
	retime,
}: {
	sourceSpan: number;
	retime?: RetimeConfig;
}): number {
	if (sourceSpan <= 0) {
		return 0;
	}
	// With a curve, rate is the curve's average speed (kept in sync on update).
	return sourceSpan / getSafeRate({ rate: retime?.rate ?? 1 });
}
