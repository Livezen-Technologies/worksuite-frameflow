// Generates the "studio" Text library packs from the hand-designed recipe
// tables in scripts/assets/text-content/ (deterministic: same tables, same bytes).
//
//   node scripts/assets/generate-text-content.mjs          write the packs + review list
//   node scripts/assets/generate-text-content.mjs --check  fail if the files on disk are out of date
//
// Output:
//   assets/packs/text-animations/worksuite-text-animations-studio/{pack.json,categories.json,items/*.json}
//   assets/packs/text-templates/worksuite-text-templates-studio/{pack.json,categories.json,items/*.json}
//   docs/text-content-review-si-ta.md   every Sinhala/Tamil string, for native-speaker review
// Then run node scripts/assets/text-packs.mjs and bun test src/text-library in apps/web.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANIMATIONS, LOOKS as ANIM_LOOKS, PREVIEW } from "./text-content/animations.mjs";
import { keyframes, phase, phaseSpan, round, unitCount } from "./text-content/dsl.mjs";
import { ADJ, ANIMATION_CATEGORIES, ASPECT_TAGS, EFFECT, FESTIVAL_TAGS, PHASE, TEMPLATE_CATEGORIES, TEMPLATE_TAGS, UNIT } from "./text-content/glossary.mjs";
import { LAYOUTS, LOOKS as TPL_LOOKS, MOTIONS, TEMPLATES, TEXT } from "./text-content/templates.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ANIMATION_PACK = "worksuite-text-animations-studio";
export const TEMPLATE_PACK = "worksuite-text-templates-studio";
export const COUNTS = { animations: 250, templates: 250 };

const uniq = (list) => [...new Set(list.filter(Boolean))];
const local = ([en, si, ta]) => ({ en, si, ta });
const words = (id) => id.replace(/-/g, " ");

function adjective(key) {
	const a = ADJ[key];
	if (!a) throw new Error(`adjective "${key}" isn't in the glossary`);
	return a;
}

function effectWord(id) {
	const e = EFFECT[id];
	if (!e) throw new Error(`effect "${id}" isn't in the glossary`);
	return e;
}

// ---------- animations ----------

function buildAnimation(row, category) {
	const [id, en, adj, unit, inSpec, emSpec, outSpec, extra = {}] = row;
	const animation = { version: 1, unit };
	if (inSpec) animation.in = phase(inSpec);
	if (emSpec) animation.emphasis = phase(emSpec);
	if (outSpec) animation.out = phase(outSpec);
	if (extra.kf) animation.keyframes = keyframes(extra.kf);
	const main = (category === "exits" ? animation.out : category === "emphasis-loops" ? animation.emphasis : animation.in) ?? animation.in;
	const effects = uniq([animation.in?.effect, animation.emphasis?.effect, animation.out?.effect]).filter((e) => e !== "none");
	const [aSi, aTa] = adjective(adj);
	const [mSi, mTa] = effectWord(main.effect);
	const [uSi, uTa] = UNIT[unit];
	const preview = extra.pv ? local(PREVIEW[extra.pv]) : null;
	if (extra.pv && !PREVIEW[extra.pv]) throw new Error(`${id}: unknown preview ${extra.pv}`);
	const sample = preview?.en ?? en;
	const units = unitCount(sample, unit);
	const busy = phaseSpan(animation.in, units) + phaseSpan(animation.out, units) + (animation.emphasis ? animation.emphasis.duration : 0);
	const duration = Math.max(3, Math.ceil((busy + 1.2) * 2) / 2);
	const tags = {
		en: uniq([...en.toLowerCase().split(/[^a-z0-9]+/), ...effects.map(words), words(unit === "grapheme" ? "letters" : `${unit}s`), words(category), adj, ...(animation.emphasis ? ["loop"] : []), ...(animation.out ? ["exit"] : []), ...(extra.tags ?? [])]).filter((w) => w.length > 1),
		si: uniq([...effects.map((e) => effectWord(e)[0]), uSi, aSi, ...(animation.emphasis ? [PHASE.emphasis[0]] : []), ...(animation.out ? [PHASE.out[0]] : [])]),
		ta: uniq([...effects.map((e) => effectWord(e)[1]), uTa, aTa, ...(animation.emphasis ? [PHASE.emphasis[1]] : []), ...(animation.out ? [PHASE.out[1]] : [])]),
	};
	const look = ANIM_LOOKS[extra.look ?? "white"];
	if (!look) throw new Error(`${id}: unknown look ${extra.look}`);
	return {
		schema: 1,
		id,
		kind: "animation",
		name: { en, si: `${aSi} ${mSi}`, ta: `${aTa} ${mTa}` },
		category,
		tags,
		animation,
		...(preview ? { previewText: preview } : {}),
		style: structuredClone(look),
		duration,
	};
}

// ---------- templates ----------

const CONDENSED = new Set(["Bebas Neue", "Anton", "Oswald"]);
const WIDE = { Bungee: 1.25, Audiowide: 1.2, "Press Start 2P": 1.6, Unbounded: 1.25, Orbitron: 1.2, "Archivo Black": 1.12, Syne: 1.1, Cinzel: 1.15 };
const ASPECT = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1 };
const graphemes = (s) => [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)].map((g) => g.segment);

/** Estimated width of one line in em (no font metrics in Node; tuned against the contact sheet). */
export function estimateEm(text, style = {}) {
	let em = 0;
	const factor = CONDENSED.has(style.fontFamily) ? 0.72 : (WIDE[style.fontFamily] ?? 1);
	for (const g of graphemes(text)) {
		if (/[඀-෿]/u.test(g)) em += 0.9 + 0.28 * (g.length - 1);
		else if (/[஀-௿]/u.test(g)) em += 1.08 + 0.4 * (g.length - 1);
		else if (/\s/u.test(g)) em += 0.28 * factor;
		else if (/[A-Z0-9%#@&]/u.test(g)) em += 0.74 * factor;
		else if (/[a-z]/u.test(g)) em += 0.58 * factor;
		else em += 0.35 * factor;
		em += style.tracking ?? 0;
	}
	return em;
}

/** Slot font size (share of frame height) that keeps every language within 80 % of the frame width. */
function fitSize(size, texts, style, aspect) {
	const maxWidth = ASPECT[aspect] * 0.8;
	const padding = style.plate ? style.plate.padding * 2 : 0;
	const widest = Math.max(...texts.map((t) => estimateEm(t, style) + padding));
	const fitted = Math.min(size, maxWidth / widest);
	return round(Math.max(fitted, size * 0.35), 1000);
}

/** Supporting roles read better a little larger than the layout's base sizes. */
const ROLE_SCALE = { p: 1.08, s: 1.25, l: 1.3, n: 1, m: 1, c: 1.25 };
/** Wider letter spacing pulls Sinhala and Tamil clusters apart, so tracking stays small. */
const MAX_TRACKING = 0.06;

function roleStyle(look, role) {
	const style = baseRoleStyle(look, role);
	return style.tracking > MAX_TRACKING ? { ...style, tracking: MAX_TRACKING } : style;
}

function baseRoleStyle(look, role) {
	if (role === "c") {
		const { tracking: _t, ...l } = look.c ?? look.l;
		return { ...l, plate: l.plate ?? { color: look.accent, padding: 0.4, radius: 0.4 } };
	}
	return look[role] ?? (role === "n" || role === "m" ? look.p : look.l ?? look.s);
}

function roleMotion(motion, role) {
	return motion[role] ?? (role === "n" || role === "m" || role === "c" ? motion.p : role === "l" ? motion.s : motion.s);
}

function buildTemplate(row, category) {
	const layout = LAYOUTS[row.layout];
	const look = TPL_LOOKS[row.look];
	const motion = MOTIONS[row.motion];
	if (!layout || !look || !motion) throw new Error(`${row.id}: unknown layout/look/motion ${row.layout}/${row.look}/${row.motion}`);
	if (row.texts.length !== layout.slots.length) throw new Error(`${row.id}: layout ${row.layout} has ${layout.slots.length} slots, ${row.texts.length} texts given`);
	const vars = { accent: look.accent };
	let busy = 0;
	const effects = [];
	const slots = layout.slots.map(([id, name, role, x, y, size], i) => {
		const text = TEXT[row.texts[i]];
		if (!text) throw new Error(`${row.id}: unknown text ${row.texts[i]}`);
		const style = structuredClone(roleStyle(look, role));
		const [unit, inSpec, emSpec, outSpec, kf] = roleMotion(motion, role);
		const delay = round(i * motion.gap);
		const animation = { version: 1, unit };
		if (inSpec) animation.in = phase(inSpec, vars, delay);
		if (emSpec) animation.emphasis = phase(emSpec, vars);
		if (outSpec) animation.out = phase(outSpec, vars);
		if (kf) animation.keyframes = keyframes(kf, vars);
		for (const p of [animation.in, animation.emphasis, animation.out]) if (p) effects.push(p.effect);
		const longest = Math.max(...text.map((t) => unitCount(t, unit)));
		busy = Math.max(busy, phaseSpan(animation.in, longest) + phaseSpan(animation.out, longest));
		return { id, name, text: local(text), x, y, size: fitSize(round(size * ROLE_SCALE[role]), text, style, layout.aspect), style, animation };
	});
	const duration = Math.max(category === "lower-thirds" || category === "end-screens" ? 5 : 4, Math.ceil((busy + 2) * 2) / 2);
	const cat = TEMPLATE_CATEGORIES.find((c) => c.id === category);
	const [aSi, aTa] = adjective(row.adj);
	const fest = row.festival ? FESTIVAL_TAGS[row.festival] : null;
	const catTags = TEMPLATE_TAGS[category];
	const aspectTags = ASPECT_TAGS[layout.aspect];
	const fx = uniq(effects);
	const tags = {
		en: uniq([...row.en.toLowerCase().split(/[^a-z0-9]+/), ...catTags.en, ...aspectTags.en, ...fx.map(words), row.adj, ...(fest?.en ?? []), ...(row.tags ?? [])]).filter((w) => w.length > 1 || /\d/.test(w)),
		si: uniq([...catTags.si, ...aspectTags.si, ...fx.map((e) => effectWord(e)[0]), aSi, ...(fest?.si ?? [])]),
		ta: uniq([...catTags.ta, ...aspectTags.ta, ...fx.map((e) => effectWord(e)[1]), aTa, ...(fest?.ta ?? [])]),
	};
	return {
		schema: 1,
		id: row.id,
		kind: "template",
		name: { en: row.en, si: `${aSi} ${cat.noun[0]}`, ta: `${aTa} ${cat.noun[1]}` },
		category,
		tags,
		duration,
		aspect: layout.aspect,
		...(row.bg ? { background: { packAsset: row.bg } } : {}),
		slots,
	};
}

// ---------- packs ----------

const PACKS = {
	animations: {
		dir: join(root, "assets", "packs", "text-animations", ANIMATION_PACK),
		manifest: {
			id: ANIMATION_PACK,
			type: "text-animations",
			version: "1.0.0",
			title: "Worksuite text animations: Studio",
			description: "250 text animations in 14 styles — reveals, slides, pop, elastic, typewriter, kinetic, glitch, blur, wipes, 3D flips, loops, exits, karaoke captions and counters. Works with Sinhala and Tamil.",
			tags: { en: ["text", "animation", "titles", "captions", "kinetic"], si: ["අකුරු", "සජීවිකරණ", "උපසිරැසි"], ta: ["உரை", "அசைவூட்டம்", "வசனங்கள்"] },
			languages: ["en", "si", "ta"],
			licence: "MIT",
			minAppVersion: "1.0.0",
			plan: "free",
			builtin: true,
		},
		categories: ANIMATION_CATEGORIES,
	},
	templates: {
		dir: join(root, "assets", "packs", "text-templates", TEMPLATE_PACK),
		manifest: {
			id: TEMPLATE_PACK,
			type: "text-templates",
			version: "1.0.0",
			title: "Worksuite text templates: Studio",
			description: "250 editable text templates — titles, captions, lower thirds, posters, quotes, social formats (16:9, 9:16, 1:1), sales, events, podcasts, tutorials, end screens, Avurudu, Vesak, Thai Pongal and Deepavali greetings — in English, Sinhala and Tamil.",
			tags: { en: ["text", "templates", "titles", "lower thirds", "social", "festive"], si: ["අකුරු", "සැකිලි", "උත්සව"], ta: ["உரை", "வார்ப்புருக்கள்", "பண்டிகை"] },
			languages: ["en", "si", "ta"],
			licence: "MIT",
			minAppVersion: "1.0.0",
			plan: "free",
			builtin: true,
		},
		categories: TEMPLATE_CATEGORIES.map(({ id, name }) => ({ id, name })),
	},
};

export function generate() {
	const animations = Object.entries(ANIMATIONS).flatMap(([category, rows]) => rows.map((row) => buildAnimation(row, category)));
	const templates = Object.entries(TEMPLATES).flatMap(([category, rows]) => rows.map((row) => buildTemplate(row, category)));
	return { animations, templates };
}

const json = (v) => `${JSON.stringify(v, null, "\t")}\n`;

/** path → contents for every generated file. */
export function generatedFiles() {
	const { animations, templates } = generate();
	if (animations.length !== COUNTS.animations) throw new Error(`expected ${COUNTS.animations} animations, recipes give ${animations.length}`);
	if (templates.length !== COUNTS.templates) throw new Error(`expected ${COUNTS.templates} templates, recipes give ${templates.length}`);
	const files = new Map();
	for (const [key, items] of [["animations", animations], ["templates", templates]]) {
		const pack = PACKS[key];
		files.set(join(pack.dir, "pack.json"), json(pack.manifest));
		files.set(join(pack.dir, "categories.json"), json(pack.categories));
		const ids = new Set();
		for (const item of items) {
			if (ids.has(item.id)) throw new Error(`duplicate id ${item.id}`);
			ids.add(item.id);
			files.set(join(pack.dir, "items", `${item.id}.json`), json(item));
		}
	}
	files.set(join(root, "docs", "text-content-review-si-ta.md"), reviewDoc(animations, templates));
	return files;
}

function reviewDoc(animations, templates) {
	const rows = new Map();
	const add = (en, si, ta, where) => {
		if (!si && !ta) return;
		const key = `${si}|${ta}`;
		const row = rows.get(key) ?? { en, si, ta, where: new Set() };
		row.where.add(where);
		rows.set(key, row);
	};
	const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " / ");
	for (const c of [...ANIMATION_CATEGORIES, ...TEMPLATE_CATEGORIES]) add(c.name.en, c.name.si, c.name.ta, "category");
	for (const [k, [si, ta]] of Object.entries(ADJ)) add(`(adjective) ${k}`, si, ta, "names");
	for (const [k, [si, ta]] of Object.entries(EFFECT)) add(`(effect) ${k}`, si, ta, "names, tags");
	for (const c of TEMPLATE_CATEGORIES) add(`(template noun) ${c.id}`, c.noun[0], c.noun[1], "names");
	const usedText = new Set(templates.flatMap((t) => t.slots.map((s) => s.text.en)));
	for (const [si, ta] of [...Object.values(UNIT), ...Object.values(PHASE)]) add("(tag word)", si, ta, "tags");
	for (const v of Object.values(TEXT)) if (usedText.has(v[0]) && v[1] !== v[0]) add(v[0], v[1], v[2], "template text");
	for (const a of animations) if (a.previewText && a.previewText.si !== a.previewText.en) add(a.previewText.en, a.previewText.si, a.previewText.ta, "preview text");
	const tagSets = [TEMPLATE_TAGS, ASPECT_TAGS, FESTIVAL_TAGS];
	for (const set of tagSets) for (const v of Object.values(set)) add(v.en.join(", "), v.si.join(", "), v.ta.join(", "), "tags");
	const lines = [
		"# Sinhala and Tamil strings in the Studio text packs — for review",
		"",
		"Generated by `node scripts/assets/generate-text-content.mjs`; edit the tables in `scripts/assets/text-content/` (not the item files) and run it again.",
		"",
		"The item schema has no per-string review flag, so every Sinhala (si) and Tamil (ta) string the generator writes is listed here. **Status: needs native-speaker review** — all of them were written to be short and plain, but none has been checked by a native speaker yet. Item names are composed as *adjective + effect noun (unit)* for animations and *adjective + category noun* for templates, so fixing a word in the glossary fixes every name that uses it.",
		"",
		"| English | සිංහල | தமிழ் | Used in |",
		"| --- | --- | --- | --- |",
		...[...rows.values()].map((r) => `| ${esc(r.en)} | ${esc(r.si)} | ${esc(r.ta)} | ${[...r.where].join(", ")} |`),
		"",
	];
	return lines.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const files = generatedFiles();
	const check = process.argv.includes("--check");
	const stale = [];
	for (const pack of Object.values(PACKS)) {
		const itemsDir = join(pack.dir, "items");
		if (existsSync(itemsDir))
			for (const f of readdirSync(itemsDir)) {
				const p = join(itemsDir, f);
				if (!files.has(p)) {
					stale.push(p);
					if (!check) rmSync(p);
				}
			}
	}
	for (const [path, data] of files) {
		const current = existsSync(path) ? readFileSync(path, "utf8") : null;
		if (current === data) continue;
		stale.push(path);
		if (!check) {
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, data);
		}
	}
	if (check && stale.length) {
		console.error(`Text content is out of date (${stale.length} files); run node scripts/assets/generate-text-content.mjs`);
		process.exit(1);
	}
	console.log(check ? "Text content is up to date." : `Wrote ${COUNTS.animations} animations and ${COUNTS.templates} templates (${stale.length} files changed).`);
}
