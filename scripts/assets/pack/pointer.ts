import { EASE, ellipse, fill, group, type Key, path, pathData, rect, type Shape, stroke, trim } from "../lottie-dsl";
import type { LayerInput } from "./common";

// A mouse cursor and a computer mouse for "click here" moments. These
// replace an earlier pointing hand that read badly once its other fingers
// were hidden, so nothing here is hand-shaped.

/** Classic arrow pointer; the hotspot (tip) is at the origin. */
export const CURSOR_ARROW = pathData([[0, 0], [0, 96], [24, 74], [41, 110], [58, 102], [41, 67], [72, 67]], true);

/** A ring that expands from the origin plus `ticks` short burst lines, starting at `t`. */
export function clickRipple(color: string, t: number, { size = 200, ticks = 4, width = 9 }: { size?: number; ticks?: number; width?: number } = {}): Shape[] {
	const ring = group(
		[ellipse([size, size]), stroke(color, width, { opacity: [[t, 0], [t + 1, 95, EASE.out], [t + 16, 0]] as Key[] })],
		{ scale: [[t, [20, 20], EASE.out], [t + 16, [100, 100]]] as Key[] },
		"Click ring",
	);
	// Ticks fan out over the upper-left, away from the cursor body.
	const r1 = size * 0.36;
	const r2 = size * 0.62;
	const lines = Array.from({ length: ticks }, (_, i) => {
		const angle = -170 + (i * 130) / Math.max(1, ticks - 1);
		return group(
			[path(pathData([[0, -r1], [0, -r2]])), trim([[t, 0, EASE.out], [t + 5, 0], [t + 11, 100]] as Key[], [[t, 0, EASE.out], [t + 6, 100]] as Key[]), stroke(color, width)],
			{ rotation: angle + 90 },
			`Click tick ${i + 1}`,
		);
	});
	return [ring, ...lines];
}

/**
 * A cursor that glides from `from` to the hotspot `at`, presses at `press`
 * (scale 90 % and a small nudge down), releases, and leaves to `from` at
 * `leave`. Returns the cursor layer and the click ripple layer (top first).
 */
export function cursorClick({
	at,
	from,
	arrive,
	press,
	leave,
	fill: fillColor,
	outline,
	ripple,
	scale = 100,
	rippleSize = 200,
}: {
	at: number[];
	from: number[];
	arrive: number;
	press: number;
	leave?: number;
	fill: string;
	outline: string;
	ripple: string;
	scale?: number;
	rippleSize?: number;
}): LayerInput[] {
	const down = [at[0], at[1] + 6 * (scale / 100)];
	const position: Key[] = [
		[arrive - 24, from, EASE.inOut],
		[arrive, at],
		[press - 3, at, EASE.out],
		[press, down, EASE.out],
		[press + 7, at],
	];
	const s = (k: number): number[] => [scale * k, scale * k];
	const scaleKeys: Key[] = [[press - 3, s(1), EASE.out], [press, s(0.9), EASE.out], [press + 7, s(1)]];
	const opacity: Key[] = [[arrive - 24, 0, EASE.out], [arrive - 18, 100]];
	if (leave !== undefined) {
		position.push([leave, at, EASE.in], [leave + 20, from]);
		opacity.push([leave + 12, 100, EASE.in], [leave + 20, 0]);
	}
	return [
		{
			name: "Cursor",
			position,
			scale: scaleKeys,
			opacity,
			shapes: [group([path(CURSOR_ARROW), stroke(outline, 7, { join: "round" }), fill(fillColor)], {}, "Arrow")],
		},
		{ name: "Click ripple", position: at, scale: [scale, scale], shapes: clickRipple(ripple, press, { size: rippleSize }) },
	];
}

/**
 * A computer mouse (body, two buttons, scroll wheel, cable) centred on `at`;
 * its LEFT button presses down and darkens at `press` and releases after.
 * A click ripple bursts above the left button. Returns layers top first.
 */
export function mouseDevice({
	at,
	press,
	body,
	outline,
	pressed,
	ripple,
	release = press + 8,
	scale = 140,
}: {
	at: number[];
	press: number;
	body: string;
	outline: string;
	pressed: string;
	ripple: string;
	release?: number;
	scale?: number;
}): LayerInput[] {
	const z = scale / 100;
	const W = 300;
	const H = 460;
	const split = -60; // y of the line between buttons and body
	const top = -H / 2;
	const r = W / 2;
	// Left button: top-left quarter of the body down to the split line.
	const k = r * 0.5523;
	const leftButton = pathData(
		[
			[0, top, -k, 0, 0, 0],
			[0, split],
			[-r, split],
			[-r, top + r, 0, 0, 0, -k],
		],
		true,
	);
	const sink: Key[] = [[press - 3, [0, 0], EASE.out], [press, [0, 8], EASE.out], [release, [0, 8], EASE.inOut], [release + 5, [0, 0]]];
	const darken: Key[] = [[press - 3, 0, EASE.out], [press, 100], [release, 100, EASE.inOut], [release + 5, 0]];
	const nudge: Key[] = [[press - 3, at, EASE.out], [press, [at[0], at[1] + 4], EASE.out], [release + 5, at]];
	return [
		{ name: "Click ripple", position: [at[0] - 80 * z, at[1] + (top - 40) * z], shapes: clickRipple(ripple, press, { size: 230, width: 12 }) },
		{
			name: "Left button",
			position: nudge,
			scale: [scale, scale],
			shapes: [
				group([path(leftButton), stroke(outline, 12, { join: "round" }), fill(pressed, darken), fill(body)], { position: sink }, "Left button press"),
			],
		},
		{
			name: "Mouse",
			position: nudge,
			scale: [scale, scale],
			shapes: [
				group([rect([34, 70], [0, split - 62], 17), fill(outline)], {}, "Wheel"),
				group([path(pathData([[0, top], [0, split]])), stroke(outline, 10)], {}, "Divider"),
				group([path(pathData([[-r, split], [r, split]])), stroke(outline, 10)], {}, "Seam"),
				group([rect([W, H], [0, 0], r), stroke(outline, 14), fill(body)], {}, "Body"),
				group([path(pathData([[0, top], [0, top - 70, 0, 0, 0, -50], [90, top - 160, -60, 0, 0, 0]])), stroke(outline, 12)], {}, "Cable"),
			],
		},
	];
}
