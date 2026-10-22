import { describe, expect, test } from "bun:test";
import { ease, transitionFrame } from "../frame";
import { TRANSITIONS } from "../definitions";
import { computeTransitionTimings, findClipBefore } from "../windows";
import { DEFAULT_TRANSITION, type ClipTransition } from "../types";

const TPS = 120_000;
const s = (seconds: number) => seconds * TPS;
const dissolve = (patch: Partial<ClipTransition> = {}): ClipTransition => ({
	...DEFAULT_TRANSITION,
	type: "cross-dissolve",
	duration: 1,
	...patch,
});

describe("transition timing", () => {
	test("centred on the cut, both clips hold half the length", () => {
		const timings = computeTransitionTimings({
			ticksPerSecond: TPS,
			clips: [
				{ id: "a", startTime: 0, duration: s(5) },
				{ id: "b", startTime: s(5), duration: s(5), transitionIn: dissolve() },
			],
		});
		const window = timings.get("b")!.in!;
		expect(window.start).toBe(s(4.5));
		expect(window.end).toBe(s(5.5));
		expect(timings.get("a")!.out).toBe(window);
		expect(timings.get("a")!.holdAfter).toBe(s(0.5));
		expect(timings.get("b")!.holdBefore).toBe(s(0.5));
	});

	test("start and end alignment", () => {
		const clips = (alignment: ClipTransition["alignment"]) => [
			{ id: "a", startTime: 0, duration: s(5) },
			{
				id: "b",
				startTime: s(5),
				duration: s(5),
				transitionIn: dissolve({ alignment }),
			},
		];
		const start = computeTransitionTimings({
			clips: clips("start"),
			ticksPerSecond: TPS,
		}).get("b")!;
		expect([start.in!.start, start.in!.end, start.holdBefore]).toEqual([
			s(5),
			s(6),
			0,
		]);
		const end = computeTransitionTimings({
			clips: clips("end"),
			ticksPerSecond: TPS,
		}).get("a")!;
		expect([end.out!.start, end.out!.end, end.holdAfter]).toEqual([
			s(4),
			s(5),
			0,
		]);
	});

	test("no transition across a gap, and length capped by short clips", () => {
		const gap = computeTransitionTimings({
			ticksPerSecond: TPS,
			clips: [
				{ id: "a", startTime: 0, duration: s(5) },
				{ id: "b", startTime: s(6), duration: s(5), transitionIn: dissolve() },
			],
		});
		expect(gap.get("b")!.in).toBeUndefined();
		const short = computeTransitionTimings({
			ticksPerSecond: TPS,
			clips: [
				{ id: "a", startTime: 0, duration: s(0.2) },
				{
					id: "b",
					startTime: s(0.2),
					duration: s(5),
					transitionIn: dissolve({ duration: 2 }),
				},
			],
		});
		const window = short.get("b")!.in!;
		expect(window.start).toBeGreaterThanOrEqual(0);
		expect(window.end - window.start).toBeCloseTo(s(0.4));
	});

	test("findClipBefore finds the touching clip only", () => {
		const clips = [
			{ id: "a", startTime: 0, duration: s(2) },
			{ id: "b", startTime: s(2), duration: s(2) },
			{ id: "c", startTime: s(5), duration: s(2) },
		];
		expect(
			findClipBefore({ clips, clip: clips[1], ticksPerSecond: TPS })?.id,
		).toBe("a");
		expect(
			findClipBefore({ clips, clip: clips[2], ticksPerSecond: TPS }),
		).toBeNull();
	});
});

describe("transition frames", () => {
	test("easing hits its ends and is monotonic", () => {
		for (const easing of [
			"linear",
			"ease-in",
			"ease-out",
			"ease-in-out",
		] as const) {
			expect(ease({ easing, t: 0 })).toBe(0);
			expect(ease({ easing, t: 1 })).toBe(1);
			let last = -1;
			for (let t = 0; t <= 1; t += 0.05) {
				const v = ease({ easing, t });
				expect(v).toBeGreaterThanOrEqual(last);
				last = v;
			}
		}
	});

	test("every transition starts showing only the outgoing clip and ends showing only the incoming one", () => {
		for (const { type } of TRANSITIONS) {
			for (const direction of ["left", "right", "up", "down"] as const) {
				const inStart = transitionFrame({
					type,
					role: "in",
					progress: 0,
					direction,
				});
				const inEnd = transitionFrame({
					type,
					role: "in",
					progress: 1,
					direction,
				});
				const hiddenAtStart =
					inStart.opacity === 0 ||
					Math.abs(inStart.offsetX) >= 1 ||
					Math.abs(inStart.offsetY) >= 1 ||
					(inStart.mask !== null &&
						(inStart.mask.width === 0 || inStart.mask.height === 0));
				expect(hiddenAtStart, `${type} ${direction} in@0`).toBe(true);
				expect(inEnd.opacity, `${type} in@1 opacity`).toBe(1);
				expect(inEnd.offsetX).toBeCloseTo(0);
				expect(inEnd.offsetY).toBeCloseTo(0);
				expect(inEnd.scale).toBeCloseTo(1);
				expect(inEnd.rotate).toBeCloseTo(0);
				expect(inEnd.blur).toBeCloseTo(0);
				if (inEnd.mask) {
					expect(
						inEnd.mask.width,
						`${type} mask covers width`,
					).toBeGreaterThanOrEqual(1);
					expect(
						inEnd.mask.height,
						`${type} mask covers height`,
					).toBeGreaterThanOrEqual(1);
				}
				const outStart = transitionFrame({
					type,
					role: "out",
					progress: 0,
					direction,
				});
				expect(outStart.opacity).toBe(1);
				expect(outStart.offsetX).toBeCloseTo(0);
				expect(outStart.scale).toBeCloseTo(1);
			}
		}
	});

	test("push moves both clips the same way; dip to black is black in the middle", () => {
		const a = transitionFrame({
			type: "push",
			role: "out",
			progress: 0.5,
			direction: "left",
		});
		const b = transitionFrame({
			type: "push",
			role: "in",
			progress: 0.5,
			direction: "left",
		});
		// "left" = the picture moves left: the outgoing clip exits left and the
		// incoming one follows one frame-width behind it.
		expect(a.offsetX).toBeCloseTo(-0.5);
		expect(b.offsetX - a.offsetX).toBeCloseTo(1);
		const mid = (role: "in" | "out") =>
			transitionFrame({
				type: "dip-to-black",
				role,
				progress: 0.5,
				direction: "left",
			}).opacity;
		expect(mid("in")).toBe(0);
		expect(mid("out")).toBe(0);
	});

	test("a wipe from the left reveals the left edge first", () => {
		const f = transitionFrame({
			type: "wipe",
			role: "in",
			progress: 0.25,
			direction: "right",
		});
		expect(f.mask?.shape).toBe("rectangle");
		if (f.mask?.shape === "rectangle") {
			expect(f.mask.centerX - f.mask.width / 2).toBeCloseTo(-0.5);
		}
	});
});
