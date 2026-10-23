import { generateUUID } from "@/utils/id";
import type { CursorLog, ZoomSegment, ZoomSettings } from "./types";
import { MAX_LEVEL, MIN_LEVEL } from "./types";

/**
 * Auto zoom (SC-11): every click or burst of typing is a reason to look
 * closer. Nearby moments merge into one zoom; the zoom ends after a pause
 * or when the cursor heads far away. Sensitivity sets how long a zoom
 * lingers and how far the cursor may wander before it zooms out.
 */
const SENSITIVITY = {
	low: { hold: 1.5, mergeGap: 0.8, radius: 0.2, minEvents: 2 },
	medium: { hold: 2.2, mergeGap: 1.5, radius: 0.3, minEvents: 1 },
	high: { hold: 3, mergeGap: 2.5, radius: 0.4, minEvents: 1 },
} as const;

const LEAD_IN = 0.4;

interface Moment {
	t: number;
	x: number;
	y: number;
}

export function clampLevel(level: number): number {
	return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level));
}

export function generateZooms({
	log,
	duration,
	settings,
}: {
	log: CursorLog;
	duration: number;
	settings: ZoomSettings;
}): ZoomSegment[] {
	const s = SENSITIVITY[settings.sensitivity];
	const moments: Moment[] = [
		...log.clicks.map(([t, x, y]) => ({ t, x, y })),
		...log.typing.map(([t, x, y]) => ({ t, x, y })),
	].sort((a, b) => a.t - b.t);

	const groups: Moment[][] = [];
	for (const m of moments) {
		const group = groups[groups.length - 1];
		const last = group?.[group.length - 1];
		const centre = group && {
			x: group.reduce((sum, g) => sum + g.x, 0) / group.length,
			y: group.reduce((sum, g) => sum + g.y, 0) / group.length,
		};
		if (
			group &&
			last &&
			centre &&
			m.t - last.t <= s.mergeGap &&
			Math.hypot(m.x - centre.x, m.y - centre.y) <= s.radius
		)
			group.push(m);
		else groups.push([m]);
	}

	const segments: ZoomSegment[] = [];
	for (const group of groups) {
		if (group.length < s.minEvents) continue;
		const first = group[0];
		const last = group[group.length - 1];
		let end = last.t + s.hold;
		// Zoom out early when the cursor heads far from where the action was.
		const cx = group.reduce((sum, g) => sum + g.x, 0) / group.length;
		const cy = group.reduce((sum, g) => sum + g.y, 0) / group.length;
		const away = log.samples.find(
			([t, x, y]) =>
				t > last.t && t < end && Math.hypot(x - cx, y - cy) > s.radius * 1.5,
		);
		if (away) end = Math.max(last.t + 0.5, away[0]);
		const start = Math.max(0, first.t - LEAD_IN - settings.ease);
		end = Math.min(duration, end + settings.ease);
		if (end - start < settings.ease * 2 + 0.3) continue;
		const prev = segments[segments.length - 1];
		if (prev && start <= prev.end) {
			// Overlapping zooms become one, centred between them.
			prev.end = Math.max(prev.end, end);
			prev.x = (prev.x + cx) / 2;
			prev.y = (prev.y + cy) / 2;
			continue;
		}
		segments.push({
			id: generateUUID(),
			start,
			end,
			level: clampLevel(settings.level),
			follow: settings.follow,
			x: cx,
			y: cy,
			ease: settings.ease,
		});
	}
	return segments;
}
