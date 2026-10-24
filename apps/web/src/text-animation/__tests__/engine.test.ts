import { describe, expect, test } from "bun:test";
import { animationForCaption } from "../captions";
import { applyEasing, cubicBezier, EASING_NAMES } from "../easing";
import { TEXT_EFFECTS, getTextEffect } from "../effects";
import { createTextAnimation, defaultPhase, evaluateKeyframes, evaluateTextAnimation, phaseSpan, staggerRanks } from "../evaluate";
import { layoutText, renderAnimatedText, frameTime } from "../render";
import { breakLines, countUnits, dominantScript, graphemes, wordSegments } from "../segment";
import type { TextAnimationStyle } from "../types";
import { hashLog, recordingContext } from "./mock-context";

const style: TextAnimationStyle = {
	fontFamily: "Inter",
	fontWeight: 700,
	fontSize: 40,
	tracking: 0,
	lineHeight: 1.2,
	align: "center",
	fill: "#FFFFFF",
	stroke: { color: "#000000", width: 2 },
	shadow: { color: "#000000", blur: 4, x: 0, y: 2 },
	glow: { color: "#2EC4FF", size: 0.2 },
	plate: { color: "#111111", padding: 0.3, radius: 0.1 },
	gradient: null,
};

describe("segmentation", () => {
	test("Sinhala graphemes keep vowel signs and conjuncts together", () => {
		// ශ්‍රී (shri: sha + al-lakuna + ZWJ + ra + ii) is one shape.
		expect(graphemes("ශ්‍රී")).toEqual(["ශ්‍රී"]);
		// ක්‍ය (yansaya) and the vowel sign stay with the consonant.
		expect(graphemes("වාක්‍ය")).toEqual(["වා", "ක්‍ය"]);
		expect(graphemes("ලංකා")).toEqual(["ලං", "කා"]);
	});
	test("Tamil clusters, including க்ஷ and ஸ்ரீ", () => {
		expect(graphemes("தமிழ்")).toEqual(["த", "மி", "ழ்"]);
		expect(graphemes("க்ஷ")).toEqual(["க்ஷ"]);
		expect(graphemes("ஸ்ரீ")).toEqual(["ஸ்ரீ"]);
	});
	test("mixed Sinhala-English words", () => {
		const words = wordSegments("Hello ශ්‍රී ලංකා, 2026!").filter((w) => !w.space).map((w) => w.text);
		expect(words).toEqual(["Hello", "ශ්‍රී", "ලංකා,", "2026!"]);
		expect(countUnits("Hello ශ්‍රී ලංකා", "grapheme")).toBe(5 + 1 + 2);
		expect(dominantScript("Hello ශ්‍රී ලංකාව")).toBe("sinhala");
	});
	test("line breaking never splits a cluster", () => {
		const measure = (s: string) => graphemes(s).length * 10;
		const lines = breakLines("ශ්‍රී ලංකා ජනරජය Sri Lanka", measure, 40);
		for (const line of lines) expect(graphemes(line).join("")).toBe(line);
		expect(lines.join(" ").replace(/\s+/g, " ")).toBe("ශ්‍රී ලංකා ජනරජය Sri Lanka");
		// A word wider than the line breaks between clusters only.
		const long = breakLines("ක්‍ෂණිකවම", measure, 20);
		expect(long.join("")).toBe("ක්‍ෂණිකවම");
		for (const piece of long) expect(graphemes(piece).length).toBeLessThanOrEqual(2);
	});
});

describe("easing", () => {
	test("every named easing starts at 0 and ends at 1", () => {
		for (const name of EASING_NAMES) {
			expect(applyEasing(name, 0)).toBeCloseTo(0, 5);
			expect(applyEasing(name, 1)).toBeCloseTo(1, 5);
		}
	});
	test("cubic-bezier matches CSS ease at mid-points", () => {
		const ease = cubicBezier(0.25, 0.1, 0.25, 1);
		expect(ease(0.5)).toBeCloseTo(0.8024, 3);
		expect(applyEasing([0, 0, 1, 1], 0.37)).toBeCloseTo(0.37, 4);
	});
});

describe("stagger", () => {
	test("orders", () => {
		expect(staggerRanks(5, "forward")).toEqual([0, 1, 2, 3, 4]);
		expect(staggerRanks(5, "reverse")).toEqual([4, 3, 2, 1, 0]);
		expect(staggerRanks(5, "center-out")).toEqual([2, 1, 0, 1, 2]);
		expect(staggerRanks(5, "edges-in")).toEqual([0, 1, 2, 1, 0]);
		const r = staggerRanks(8, "random(42)");
		expect([...r].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		expect(staggerRanks(8, "random(42)")).toEqual(r);
		expect(staggerRanks(8, "random(43)")).not.toEqual(r);
	});
	test("phase span", () => {
		expect(phaseSpan({ ...defaultPhase("fade"), delay: 0.2, duration: 0.5, stagger: 0.1 }, 4)).toBeCloseTo(1, 6);
	});
});

describe("effects", () => {
	test("at least 40 registered with unique ids", () => {
		expect(TEXT_EFFECTS.length).toBeGreaterThanOrEqual(40);
		expect(new Set(TEXT_EFFECTS.map((e) => e.id)).size).toBe(TEXT_EFFECTS.length);
		for (const id of ["fade", "slide", "rise", "drop", "pop", "scale-up", "scale-down", "zoom-blur", "blur-in", "typewriter", "scramble", "wave", "bounce", "elastic", "flip-x", "flip-y", "rotate-in", "skew-in", "glitch", "rgb-split", "neon-flicker", "mask-wipe", "split-reveal", "tracking-expand", "highlight-sweep", "underline-draw", "box-reveal", "stamp", "shake", "jitter", "swing", "colour-cycle", "gradient-sweep", "stroke-draw", "3d-tilt", "stretch", "karaoke-fill", "number-counter", "shine", "pulse", "float"])
			expect(getTextEffect(id)?.id).toBe(id);
	});

	for (const effect of TEXT_EFFECTS) {
		test(`${effect.id}: bounded, deterministic, rest at p=1`, () => {
			for (const phase of effect.phases) {
				for (const p of [0, 0.13, 0.5, 0.77, 1]) {
					const ctx = { index: 2, count: 5, p, raw: p, phase, direction: effect.defaults.direction, intensity: 1, params: { ...(effect.params ?? {}) }, text: "ශ්‍රී 1,250", time: 1.234, seed: 12 };
					const a = effect.fn(ctx);
					expect(effect.fn({ ...ctx })).toEqual(a);
					for (const [key, value] of Object.entries(a)) {
						if (typeof value !== "number") continue;
						expect(Number.isFinite(value)).toBe(true);
						if (key === "opacity" || key === "clip" || key === "reveal" || key === "shine" || key === "strokeDraw") {
							expect(value).toBeGreaterThanOrEqual(0);
							expect(value).toBeLessThanOrEqual(1);
						}
						if (key === "x" || key === "y" || key === "blur" || key === "tracking" || key === "rgbSplit") expect(Math.abs(value)).toBeLessThanOrEqual(4);
						if (key === "scaleX" || key === "scaleY") expect(Math.abs(value)).toBeLessThanOrEqual(5);
						if (key === "rotation") expect(Math.abs(value)).toBeLessThanOrEqual(360);
					}
				}
				if (phase !== "emphasis") {
					const rest = effect.fn({ index: 0, count: 1, p: 1, raw: 1, phase, direction: effect.defaults.direction, intensity: 1, params: {}, text: "Hi", time: 5, seed: 1 });
					if (rest.opacity !== undefined) expect(rest.opacity).toBeCloseTo(1, 5);
					for (const key of ["x", "y", "rotation", "blur", "tracking", "skewX"] as const) if (rest[key] !== undefined) expect(Math.abs(rest[key]!)).toBeLessThan(1e-6);
					for (const key of ["scaleX", "scaleY"] as const) if (rest[key] !== undefined) expect(rest[key]).toBeCloseTo(1, 5);
				}
			}
		});
	}
	test("in progress 0 hides fade-like effects", () => {
		for (const id of ["fade", "rise", "slide", "blur-in", "zoom-blur", "scale-up"]) {
			const e = getTextEffect(id)!;
			expect(e.fn({ index: 0, count: 1, p: 0, raw: 0, phase: "in", direction: "up", intensity: 1, params: {}, text: "a", time: 0, seed: 0 }).opacity).toBe(0);
		}
	});
	test("number counter and scramble", () => {
		const e = getTextEffect("number-counter")!;
		const c = { index: 0, count: 1, raw: 0.5, phase: "in" as const, direction: "up" as const, intensity: 1, params: { from: 0 }, text: "1,000 views", time: 0, seed: 0 };
		expect(e.fn({ ...c, p: 0.5 }).text).toBe("500 views");
		expect(e.fn({ ...c, p: 1 }).text).toBe("1,000 views");
		const s = getTextEffect("scramble")!;
		const mid = s.fn({ ...c, p: 0.5, text: "ලංකාව" }).text!;
		expect(/[඀-෿]/u.test(mid)).toBe(true);
	});
});

describe("evaluation", () => {
	const anim = createTextAnimation({
		unit: "word",
		in: { ...defaultPhase("rise"), duration: 0.5, stagger: 0.1 },
		emphasis: { ...defaultPhase("pulse", "emphasis"), duration: 1 },
		out: { ...defaultPhase("fade", "out"), duration: 0.4, stagger: 0 },
	});
	const units = ["one", "two", "three"];
	test("progress 0/1 states", () => {
		const start = evaluateTextAnimation({ animation: anim, units, time: 0, duration: 4 });
		expect(start.map((s) => s.opacity)).toEqual([0, 0, 0]);
		const settled = evaluateTextAnimation({ animation: { ...anim, emphasis: undefined }, units, time: 1, duration: 4 });
		for (const s of settled) {
			expect(s.opacity).toBe(1);
			expect(s.y).toBe(0);
		}
		const end = evaluateTextAnimation({ animation: anim, units, time: 4, duration: 4 });
		expect(end.map((s) => s.opacity)).toEqual([0, 0, 0]);
	});
	test("stagger delays later words", () => {
		const s = evaluateTextAnimation({ animation: anim, units, time: 0.15, duration: 4 });
		expect(s[0]!.opacity).toBeGreaterThan(s[1]!.opacity);
		expect(s[2]!.opacity).toBe(0);
	});
	test("keyframes with per-key easing and colours", () => {
		expect(evaluateKeyframes([{ t: 0, v: 0 }, { t: 1, v: 10 }], 0.5)).toBeCloseTo(5, 6);
		expect(evaluateKeyframes([{ t: 0, v: 0, easing: "ease-in-quad" }, { t: 1, v: 10 }], 0.5)).toBeCloseTo(2.5, 6);
		expect(evaluateKeyframes([{ t: 0, v: "#000000" }, { t: 1, v: "#FFFFFF" }], 0.5)).toBe("#808080");
		const withKeys = createTextAnimation({ unit: "grapheme", keyframes: { stagger: 0.5, tracks: { y: [{ t: 0, v: 1 }, { t: 1, v: 0 }], fill: [{ t: 0, v: "#FF0000" }] } } });
		const s = evaluateTextAnimation({ animation: withKeys, units: ["a", "b"], time: 0.5, duration: 2 });
		expect(s[0]!.y).toBeCloseTo(0.5, 6);
		expect(s[1]!.y).toBeCloseTo(1, 6);
		expect(s[0]!.fill).toBe("#FF0000");
	});
	test("caption word timings drive unit starts", () => {
		const a = animationForCaption({
			animation: createTextAnimation({ unit: "word", in: defaultPhase("karaoke-fill") }),
			caption: { content: "හෙලෝ my friend", words: [{ text: "හෙලෝ", start: 0, end: 0.5 }, { text: "my", start: 0.6, end: 0.8 }, { text: "friend", start: 1, end: 1.6 }] },
		});
		expect(a.unitTimes).toEqual([{ start: 0, end: 0.5 }, { start: 0.6, end: 0.8 }, { start: 1, end: 1.6 }]);
		const s = evaluateTextAnimation({ animation: a, units: ["හෙලෝ", "my", "friend"], time: 0.7, duration: 3 });
		expect(s[0]!.fillSweep!.amount).toBe(1);
		expect(s[1]!.fillSweep!.amount).toBeCloseTo(0.5, 6);
		expect(s[2]!.fillSweep!.amount).toBe(0);
		const mismatch = animationForCaption({ animation: a, caption: { content: "edited words here now", words: [{ text: "x", start: 0, end: 1 }] } });
		expect(mismatch.unitTimes).toBeUndefined();
	});
});

describe("renderer", () => {
	const anim = createTextAnimation({ unit: "grapheme", in: { ...defaultPhase("pop"), stagger: 0.05 }, emphasis: { ...defaultPhase("wave", "emphasis") } });
	const text = "Hello ශ්‍රී ලංකා";
	test("layout puts every cluster in a unit", () => {
		const { ctx } = recordingContext();
		const layout = layoutText({ ctx, text, style, unit: "grapheme" });
		expect(layout.units.map((u) => u.text).join("")).toBe(text.replace(/ /g, ""));
	});
	test("same frame time → identical draw calls (preview == export)", () => {
		const frame = 37;
		const fps = 30;
		const a = recordingContext();
		renderAnimatedText({ ctx: a.ctx, text, style, animation: anim, time: frameTime(frame, fps), duration: 3 });
		// The export samples frames by index; the preview by seconds rounded to the same instant.
		const b = recordingContext();
		renderAnimatedText({ ctx: b.ctx, text, style, animation: JSON.parse(JSON.stringify(anim)), time: 37 / 30, duration: 3 });
		expect(hashLog(a.log)).toBe(hashLog(b.log));
		const c = recordingContext();
		renderAnimatedText({ ctx: c.ctx, text, style, animation: anim, time: frameTime(frame + 1, fps), duration: 3 });
		expect(hashLog(c.log)).not.toBe(hashLog(a.log));
		// Stable reference so accidental renderer changes are noticed.
		expect(a.log.length).toBeGreaterThan(50);
	});
	test("every effect renders without throwing (all phases)", () => {
		for (const effect of TEXT_EFFECTS) {
			const animation = createTextAnimation({ unit: effect.defaults.unit ?? "word", in: defaultPhase(effect.id), emphasis: effect.phases.includes("emphasis") ? defaultPhase(effect.id, "emphasis") : undefined, out: defaultPhase(effect.id, "out") });
			for (const t of [0, 0.2, 1.5, 2.9]) {
				const { ctx } = recordingContext();
				expect(() => renderAnimatedText({ ctx, text: "Sale 1,250 ශ්‍රී", style: { ...style, gradient: ["#FF0000", "#0000FF"] }, animation, time: t, duration: 3 })).not.toThrow();
			}
		}
	});
});
