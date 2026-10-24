// Imports the extra Text library sets from the Worksuite Text Library page
// (its window.TEXTDATA, saved as JSON) into built-in packs:
//   mixed     → text-templates/worksuite-text-templates-mixed     (English mixed with Sinhala or Tamil)
//   anim1000  → text-animations/worksuite-text-animations-1000
//   tpl1000   → text-templates/worksuite-text-templates-1000
//   video     → text-templates/worksuite-text-video-packs          (intros, end screens, captions, name tags…)
// Templates keep their animated background as `bg` ({ t: "rays", c: [colours] }),
// which the app draws in previews and adds to the timeline as an animation clip.
//   node scripts/assets/import-text-library.mjs <textdata.json>
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const data = JSON.parse(readFileSync(process.argv[2], "utf8"));

const PACKS = [
	{
		key: "mixed",
		cats: "mcats",
		type: "text-templates",
		id: "worksuite-text-templates-mixed",
		title: "Worksuite text templates: Mixed languages",
		description: "1,000 templates that mix English with Sinhala or Tamil the way people really write: greetings, events, sales, lessons, lower thirds and social posts, in 16:9, 9:16 and 1:1, with animated backgrounds.",
		tags: { en: ["text", "templates", "mixed", "code-mixed", "singlish"], si: ["අකුරු", "සැකිලි", "මිශ්‍ර"], ta: ["உரை", "வார்ப்புருக்கள்", "கலப்பு"] },
	},
	{
		key: "anim1000",
		cats: "a1cats",
		type: "text-animations",
		id: "worksuite-text-animations-1000",
		title: "Worksuite text animations: 1,000",
		description: "1,000 more text animations: reveals, kinetic type, 3D flips, glitch, neon, typewriter, captions and loops, for English, Sinhala and Tamil text.",
		tags: { en: ["text", "animations", "kinetic", "captions"], si: ["අකුරු", "සජීවිකරණ"], ta: ["உரை", "அசைவூட்டம்"] },
	},
	{
		key: "tpl1000",
		cats: "t1cats",
		type: "text-templates",
		id: "worksuite-text-templates-1000",
		title: "Worksuite text templates: 1,000",
		description: "1,000 editable text templates with animated backgrounds: greetings, events, sales, education, tutorials, lower thirds and podcasts, in English, Sinhala and Tamil.",
		tags: { en: ["text", "templates", "titles", "greetings", "festive"], si: ["අකුරු", "සැකිලි", "උත්සව"], ta: ["உரை", "வார்ப்புருக்கள்", "பண்டிகை"] },
	},
	{
		key: "video",
		cats: "vcats",
		type: "text-templates",
		id: "worksuite-text-video-packs",
		title: "Worksuite video packs",
		description: "1,000 ready-made video texts: intros, end screens, captions, name tags, social, podcast, YouTube, travel, news and tech, in English, Sinhala and Tamil.",
		tags: { en: ["video", "intro", "end screen", "youtube", "podcast", "news"], si: ["වීඩියෝ", "ආරම්භක"], ta: ["வீடியோ", "அறிமுகம்"] },
	},
];

/** Only the fields the app's item schema knows; `bg` stays for templates. */
function clean(item) {
	const { anim: _anim, fontName: _font, ...rest } = item;
	return rest;
}

const counts = [];
for (const pack of PACKS) {
	const items = data[pack.key];
	const categories = data[pack.cats];
	if (!Array.isArray(items) || !Array.isArray(categories)) throw new Error(`${pack.key} is missing from the data`);
	const dir = join(root, "assets", "packs", pack.type, pack.id);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(join(dir, "items"), { recursive: true });
	writeFileSync(
		join(dir, "pack.json"),
		`${JSON.stringify(
			{
				id: pack.id,
				type: pack.type,
				version: "1.0.0",
				title: pack.title,
				description: pack.description,
				tags: pack.tags,
				languages: ["en", "si", "ta"],
				licence: "MIT",
				minAppVersion: "1.5.0",
				plan: "free",
				builtin: true,
			},
			null,
			"\t",
		)}\n`,
	);
	writeFileSync(join(dir, "categories.json"), `${JSON.stringify(categories, null, "\t")}\n`);
	for (const item of items) writeFileSync(join(dir, "items", `${item.id}.json`), `${JSON.stringify(clean(item))}\n`);
	counts.push(`${pack.id}: ${items.length}`);
}
console.log(counts.join("\n"));
