import type { MulticamCut, MulticamGroup } from "./types";

/** Whether an angle has picture at a group time. */
export function covers({
	group,
	angle,
	at,
}: {
	group: MulticamGroup;
	angle: number;
	at: number;
}): boolean {
	const a = group.angles[angle];
	return !!a && at >= a.offset - 1e-6 && at < a.offset + a.duration - 1e-6;
}

export interface CutSpan {
	start: number;
	end: number;
	angle: number;
}

/**
 * Cut list → spans over the whole group. Where the chosen angle has no
 * picture (it started later or ended sooner), the first angle that does
 * fills in; neighbouring spans of one angle merge.
 */
export function buildSpans({
	group,
	cuts,
}: {
	group: MulticamGroup;
	cuts: MulticamCut[];
}): CutSpan[] {
	const sorted = [...cuts]
		.filter((c) => c.at < group.length)
		.sort((a, b) => a.at - b.at);
	if (!sorted.length || sorted[0].at > 0)
		sorted.unshift({ at: 0, angle: sorted[0]?.angle ?? 0 });
	// Boundaries: every cut, plus every angle start/end inside the group.
	const marks = new Set<number>([0, group.length]);
	for (const c of sorted) marks.add(Math.max(0, c.at));
	for (const a of group.angles) {
		if (a.offset > 0 && a.offset < group.length) marks.add(a.offset);
		const end = a.offset + a.duration;
		if (end > 0 && end < group.length) marks.add(end);
	}
	const points = [...marks].sort((a, b) => a - b);
	const spans: CutSpan[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const start = points[i];
		const end = points[i + 1];
		if (end - start < 1e-6) continue;
		const mid = (start + end) / 2;
		let wanted = sorted[0].angle;
		for (const c of sorted) if (c.at <= start + 1e-6) wanted = c.angle;
		const angle = covers({ group, angle: wanted, at: mid })
			? wanted
			: group.angles.findIndex((_, k) => covers({ group, angle: k, at: mid }));
		if (angle < 0) continue; // nobody has picture here
		const last = spans[spans.length - 1];
		if (last && last.angle === angle && Math.abs(last.end - start) < 1e-6)
			last.end = end;
		else spans.push({ start, end, angle });
	}
	return spans;
}

/** Cut at `at` to `angle` (live switching): later cuts are replaced. */
export function cutTo({
	cuts,
	at,
	angle,
}: {
	cuts: MulticamCut[];
	at: number;
	angle: number;
}): MulticamCut[] {
	return [...cuts.filter((c) => c.at < at - 1e-3), { at, angle }];
}

/** Change the angle of the span under `at` only (SC-27). */
export function switchSpan({
	spans,
	at,
	angle,
}: {
	spans: CutSpan[];
	at: number;
	angle: number;
}): MulticamCut[] {
	return spans.map((s) => ({
		at: s.start,
		angle: s.start <= at && at < s.end ? angle : s.angle,
	}));
}
