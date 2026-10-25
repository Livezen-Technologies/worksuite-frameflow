import type { RetimeConfig } from "@/timeline";
import { averageCurveSpeed, sliceCurve } from "./curve";
import { getSourceTimeAtClipTime } from "./resolve";

export function getSourceSpanAtClipTime({
	clipTime,
	retime,
	duration,
}: {
	clipTime: number;
	retime?: RetimeConfig;
	/** The clip's duration, so a speed curve maps exactly. */
	duration?: number;
}): number {
	return Math.max(0, getSourceTimeAtClipTime({ clipTime, retime, duration }));
}

/** Each side of a split keeps its own part of a speed curve, so nothing plays differently. */
export function splitRetimeAtClipTime({
	retime,
	splitClipTime,
	duration,
}: {
	retime?: RetimeConfig;
	splitClipTime: number;
	duration?: number;
}): {
	left: RetimeConfig | undefined;
	right: RetimeConfig | undefined;
} {
	if (!retime?.curve?.length || !duration || duration <= 0) {
		return { left: retime, right: retime };
	}
	const total = getSourceTimeAtClipTime({ clipTime: duration, retime, duration });
	const at = total > 0 ? getSourceTimeAtClipTime({ clipTime: splitClipTime, retime, duration }) / total : 0.5;
	const side = ({ from, to }: { from: number; to: number }): RetimeConfig => {
		const curve = sliceCurve({ keyframes: retime.curve ?? [], from, to });
		return { ...retime, curve, rate: averageCurveSpeed(curve) };
	};
	return { left: side({ from: 0, to: at }), right: side({ from: at, to: 1 }) };
}

export function adjustRetimeForTrimChange({
	retime,
}: {
	retime?: RetimeConfig;
	clipTrimTime: number;
	side: "start" | "end";
}): RetimeConfig | undefined {
	return retime;
}
