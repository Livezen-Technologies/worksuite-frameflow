// Compact notation for TextAnimation phases and keyframes used by the recipe tables.
//
// Phase:     "effect duration stagger order direction easing [i=1.2] [d=0.3] [param=value…]"
//   order:   fwd | rev | mid (center-out) | edge (edges-in) | r<seed> (random(seed))
//   easing:  a name, or b:x1,y1,x2,y2 for a cubic-bezier
//   params:  numbers, #RRGGBB, true/false, @accent (filled from the look)
// Keyframes: "prop:t=v[~easing],t=v; prop:… | st=0.05 ord=fwd"

const ORDERS = { fwd: "forward", rev: "reverse", mid: "center-out", edge: "edges-in" };

function order(token) {
	if (ORDERS[token]) return ORDERS[token];
	const m = /^r(-?\d+)$/.exec(token);
	if (m) return `random(${m[1]})`;
	throw new Error(`bad stagger order "${token}"`);
}

function easing(token) {
	if (token.startsWith("b:")) {
		const v = token.slice(2).split(",").map(Number);
		if (v.length !== 4 || v.some((n) => !Number.isFinite(n))) throw new Error(`bad bezier "${token}"`);
		return v;
	}
	return token;
}

function value(raw, vars) {
	if (raw === "true") return true;
	if (raw === "false") return false;
	if (raw.startsWith("@")) {
		const v = vars?.[raw.slice(1)];
		if (v === undefined) throw new Error(`unknown variable ${raw}`);
		return v;
	}
	if (/^-?\d*\.?\d+$/.test(raw)) return Number(raw);
	return raw;
}

/** One phase from its spec string. `extraDelay` is added to the phase delay. */
export function phase(spec, vars, extraDelay = 0) {
	const [effect, dur, stagger, ord, dir, eas, ...rest] = spec.trim().split(/\s+/);
	if (!eas) throw new Error(`phase "${spec}" needs effect duration stagger order direction easing`);
	const out = {
		effect,
		duration: Number(dur),
		delay: 0,
		stagger: Number(stagger),
		staggerOrder: order(ord),
		direction: dir,
		easing: easing(eas),
		intensity: 1,
		params: {},
	};
	for (const token of rest) {
		const [k, v] = token.split("=");
		if (k === "i") out.intensity = Number(v);
		else if (k === "d") out.delay = Number(v);
		else out.params[k] = value(v, vars);
	}
	out.delay = round(out.delay + extraDelay);
	return out;
}

/** Keyframes from their spec string. */
export function keyframes(spec, vars) {
	const [tracksPart, optsPart] = spec.split("|");
	const tracks = {};
	for (const track of tracksPart.split(";").map((s) => s.trim()).filter(Boolean)) {
		const [prop, keysRaw] = track.split(/:(.*)/s);
		tracks[prop.trim()] = keysRaw.split(",").map((k) => {
			const [tv, eas] = k.trim().split("~");
			const [t, v] = tv.split("=");
			return { t: Number(t), v: value(v, vars), ...(eas ? { easing: easing(eas) } : {}) };
		});
	}
	const out = {};
	for (const token of (optsPart ?? "").trim().split(/\s+/).filter(Boolean)) {
		const [k, v] = token.split("=");
		if (k === "st") out.stagger = Number(v);
		else if (k === "ord") out.staggerOrder = order(v);
		else throw new Error(`bad keyframe option ${token}`);
	}
	return { ...out, tracks };
}

export const round = (n, step = 1000) => Math.round(n * step) / step;

/** Seconds until every unit finished a phase. */
export function phaseSpan(p, units) {
	if (!p || p.effect === "none") return 0;
	return p.delay + p.duration + p.stagger * Math.max(0, units - 1);
}

/** Rough count of units in a text (for timing checks and clip lengths). */
export function unitCount(text, unit) {
	if (unit === "block") return 1;
	if (unit === "line") return Math.max(1, text.split("\n").length);
	if (unit === "word") return Math.max(1, text.trim().split(/\s+/).length);
	return Math.max(1, [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text.replace(/\s+/g, ""))].length);
}
