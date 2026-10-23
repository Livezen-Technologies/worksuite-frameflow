/* eslint-disable opencut/prefer-object-params -- short positional helpers keep the template content readable */
import type { ParamValues } from "@/params";
import type {
	Anchor,
	Localized,
	Pack,
	PackColor,
	PackLanguage,
	PackLayer,
	PackTemplate,
} from "./types";

/*
 * The four launch packs (SP-01). No platform logos or icons (SP-14): the
 * platform is only a category name, and buttons are plain shapes in the
 * pack's or the user's colours.
 */

const L = (en: string, si: string, mixed: string = si): Localized => ({
	en,
	si,
	mixed,
});
const same = (text: string): Localized => ({ en: text, si: text, mixed: text });

/** Placeholder defaults per language, used when a field is left empty. */
export const DEFAULT_FIELDS: Record<PackLanguage, Record<string, string>> = {
	en: {
		channel: "Your Channel",
		handle: "yourhandle",
		title: "Your title here",
		name: "Your Name",
		role: "Your role",
		episode: "12",
		show: "Your Show",
		host: "Host name",
		guest: "Guest name",
		chapter: "1",
		chapterTitle: "Getting started",
		page: "Your Page",
		discount: "50%",
		date: "Sat 12 April",
		time: "7.00 pm",
		place: "Colombo",
		part: "1",
		sponsor: "Your sponsor",
		quote: "Make every second count.",
		topic: "Today's topic",
	},
	si: {
		channel: "ඔබේ චැනලය",
		handle: "yourhandle",
		title: "ඔබේ මාතෘකාව මෙතැන",
		name: "ඔබේ නම",
		role: "තනතුර",
		episode: "12",
		show: "ඔබේ වැඩසටහන",
		host: "සත්කාරකගේ නම",
		guest: "අමුත්තාගේ නම",
		chapter: "1",
		chapterTitle: "ආරම්භය",
		page: "ඔබේ පිටුව",
		discount: "50%",
		date: "අප්‍රේල් 12 සෙනසුරාදා",
		time: "ප.ව. 7.00",
		place: "කොළඹ",
		part: "1",
		sponsor: "ඔබේ අනුග්‍රාහකයා",
		quote: "සෑම තත්පරයක්ම වටිනවා.",
		topic: "අද මාතෘකාව",
	},
	mixed: {
		channel: "ඔයාගේ Channel එක",
		handle: "yourhandle",
		title: "ඔයාගේ title එක මෙතන",
		name: "ඔයාගේ නම",
		role: "Role එක",
		episode: "12",
		show: "ඔයාගේ Show එක",
		host: "Host ගේ නම",
		guest: "Guest ගේ නම",
		chapter: "1",
		chapterTitle: "Start එක",
		page: "ඔයාගේ Page එක",
		discount: "50%",
		date: "April 12 සෙනසුරාදා",
		time: "7.00 pm",
		place: "Colombo",
		part: "1",
		sponsor: "ඔයාගේ Sponsor",
		quote: "හැම second එකක්ම වටිනවා.",
		topic: "අද topic එක",
	},
};

const fadeOut = { "animation.out": "fade", "animation.outDuration": 0.4 };
const slideUp = {
	"animation.in": "slide-up",
	"animation.inDuration": 0.5,
	...fadeOut,
};
const pop = { "animation.in": "pop", "animation.inDuration": 0.4, ...fadeOut };
const fade = {
	"animation.in": "fade",
	"animation.inDuration": 0.6,
	...fadeOut,
};
const slideLeft = {
	"animation.in": "slide-right",
	"animation.inDuration": 0.5,
	"animation.out": "slide-left",
	"animation.outDuration": 0.4,
};

type Box = {
	anchor: Anchor;
	w: number;
	h: number;
	dx?: number;
	dy?: number;
	start?: number;
	duration?: number;
};

function text(
	words: Localized,
	box: Box,
	look: {
		size: number;
		color?: PackColor;
		font?: "heading" | "body";
		background?: PackColor;
		style?: ParamValues;
	},
): PackLayer {
	return {
		kind: "text",
		text: words,
		size: look.size,
		color: look.color ?? "light",
		font: look.font,
		box: look.background,
		style: look.style ?? slideUp,
		start: box.start ?? 0.2,
		duration: box.duration ?? 4,
		...box,
	};
}

/** The brand kit logo, fitted in the box (SP-05). */
function logo(box: Box): PackLayer {
	return {
		kind: "logo",
		animation: fade,
		start: box.start ?? 0,
		duration: box.duration ?? 4.4,
		...box,
	};
}

function shape(
	box: Box,
	look: {
		color: PackColor;
		shape?: "rectangle" | "ellipse";
		radius?: number;
		opacity?: number;
		animation?: ParamValues;
		audioBar?: number;
	},
): PackLayer {
	return {
		kind: "shape",
		...(look.audioBar !== undefined ? { audioBar: look.audioBar } : {}),
		shape: look.shape ?? "rectangle",
		color: look.color,
		radius: look.radius,
		opacity: look.opacity,
		animation: look.animation ?? fade,
		start: box.start ?? 0,
		duration: box.duration ?? 4.4,
		...box,
	};
}

/** Name on a coloured bar with the role underneath. */
function lowerThird(
	id: string,
	name: string,
	nameText: Localized,
	roleText: Localized,
): PackTemplate {
	return {
		id,
		name,
		purpose: "lower-third",
		layers: [
			shape(
				{ anchor: "bl", w: 0.42, h: 0.16 },
				{ color: "dark", radius: 18, opacity: 0.9, animation: slideLeft },
			),
			shape(
				{ anchor: "bl", w: 0.012, h: 0.16 },
				{ color: "accent", animation: slideLeft },
			),
			text(
				nameText,
				{ anchor: "bl", w: 0.38, h: 0.08, dx: 0.025, dy: -0.07 },
				{ size: 16, font: "heading", style: slideLeft },
			),
			text(
				roleText,
				{ anchor: "bl", w: 0.38, h: 0.06, dx: 0.025, dy: -0.015, start: 0.4 },
				{ size: 11, color: "accent", style: slideLeft },
			),
		],
	};
}

const subscribe = L("Subscribe", "සබ්ස්ක්‍රයිබ් කරන්න", "Subscribe කරන්න");

export const PACKS: Pack[] = [
	{
		id: "youtube",
		name: "YouTube",
		description:
			"Intros, lower thirds, chapters, subscribe prompts and end screens for long videos and Shorts.",
		aspects: ["16:9", "9:16"],
		safe: {
			"16:9": { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
			"9:16": { top: 0.1, right: 0.16, bottom: 0.22, left: 0.05 },
		},
		palette: {
			primary: "#E53935",
			accent: "#FFC107",
			dark: "#111827",
			light: "#FFFFFF",
		},
		fonts: { heading: "Bebas Neue", body: "Inter" },
		templates: [
			{
				id: "intro",
				name: "Intro title",
				purpose: "intro",
				layers: [
					shape(
						{ anchor: "c", w: 1.2, h: 1.2 },
						{ color: "dark", opacity: 0.55 },
					),
					logo({ anchor: "c", w: 0.14, h: 0.16, dy: -0.24, start: 0.3 }),
					text(
						same("{title}"),
						{ anchor: "c", w: 0.9, h: 0.3 },
						{
							size: 40,
							font: "heading",
							style: {
								"animation.in": "zoom-in",
								"animation.inDuration": 0.8,
								...fadeOut,
							},
						},
					),
					text(
						same("{channel}"),
						{ anchor: "c", w: 0.6, h: 0.1, dy: 0.18, start: 0.8 },
						{ size: 14, color: "accent" },
					),
				],
			},
			{
				id: "channel-card",
				name: "Channel name card",
				purpose: "title",
				layers: [
					shape(
						{ anchor: "c", w: 0.7, h: 0.32 },
						{ color: "primary", radius: 40, animation: pop },
					),
					text(
						same("{channel}"),
						{ anchor: "c", w: 0.66, h: 0.16, dy: -0.04 },
						{ size: 30, font: "heading", style: pop },
					),
					text(
						same("@{handle}"),
						{ anchor: "c", w: 0.6, h: 0.08, dy: 0.08, start: 0.5 },
						{ size: 13 },
					),
				],
			},
			{
				id: "chapter",
				name: "Chapter title",
				purpose: "title",
				layers: [
					text(
						L("Chapter {chapter}", "කොටස {chapter}", "Chapter {chapter}"),
						{ anchor: "tl", w: 0.4, h: 0.07 },
						{ size: 12, color: "accent", style: slideLeft },
					),
					text(
						same("{chapterTitle}"),
						{ anchor: "tl", w: 0.6, h: 0.12, dy: 0.08, start: 0.35 },
						{ size: 26, font: "heading", style: slideLeft },
					),
				],
			},
			lowerThird(
				"lower-third",
				"Lower third (name + role)",
				same("{name}"),
				same("{role}"),
			),
			{
				id: "subscribe",
				name: "Subscribe and bell reminder",
				purpose: "call-to-action",
				layers: [
					shape(
						{ anchor: "br", w: 0.32, h: 0.13 },
						{ color: "primary", radius: 60, animation: pop },
					),
					text(
						subscribe,
						{ anchor: "br", w: 0.32, h: 0.13 },
						{ size: 15, font: "heading", style: pop },
					),
					text(
						L(
							"Turn on notifications",
							"දැනුම්දීම් සක්‍රිය කරන්න",
							"Notifications on කරන්න",
						),
						{ anchor: "br", w: 0.4, h: 0.07, dy: -0.15, start: 0.8 },
						{ size: 11, background: "dark" },
					),
				],
			},
			{
				id: "like-share",
				name: "Like, comment, share",
				purpose: "call-to-action",
				layers: [
					text(
						L(
							"Like · Comment · Share",
							"ලයික් · කමෙන්ට් · ෂෙයාර්",
							"Like · Comment · Share කරන්න",
						),
						{ anchor: "b", w: 0.7, h: 0.1 },
						{ size: 16, font: "heading", background: "primary", style: pop },
					),
				],
			},
			{
				id: "key-point",
				name: "Key point callout",
				purpose: "title",
				layers: [
					shape(
						{ anchor: "tr", w: 0.4, h: 0.22 },
						{ color: "light", radius: 20, opacity: 0.95, animation: pop },
					),
					text(
						L("Key point", "වැදගත් කරුණ", "Key point එක"),
						{ anchor: "tr", w: 0.36, h: 0.06, dx: -0.02, dy: 0.03 },
						{ size: 10, color: "primary", font: "heading", style: pop },
					),
					text(
						same("{topic}"),
						{ anchor: "tr", w: 0.36, h: 0.12, dx: -0.02, dy: 0.08, start: 0.4 },
						{ size: 15, color: "dark", style: pop },
					),
				],
			},
			{
				id: "quote",
				name: "Quote card",
				purpose: "title",
				layers: [
					shape(
						{ anchor: "c", w: 1.2, h: 1.2 },
						{ color: "dark", opacity: 0.85 },
					),
					text(
						same("“{quote}”"),
						{ anchor: "c", w: 0.8, h: 0.3 },
						{ size: 26, style: fade },
					),
					text(
						same("— {name}"),
						{ anchor: "c", w: 0.6, h: 0.08, dy: 0.2, start: 0.8 },
						{ size: 13, color: "accent", style: fade },
					),
				],
			},
			{
				id: "countdown",
				name: "Countdown",
				purpose: "intro",
				layers: [
					shape(
						{ anchor: "c", w: 0.3, h: 0.5, duration: 3 },
						{ color: "primary", shape: "ellipse" },
					),
					text(
						same("3"),
						{ anchor: "c", w: 0.3, h: 0.3, start: 0, duration: 1 },
						{ size: 60, font: "heading", style: pop },
					),
					text(
						same("2"),
						{ anchor: "c", w: 0.3, h: 0.3, start: 1, duration: 1 },
						{ size: 60, font: "heading", style: pop },
					),
					text(
						same("1"),
						{ anchor: "c", w: 0.3, h: 0.3, start: 2, duration: 1 },
						{ size: 60, font: "heading", style: pop },
					),
				],
			},
			{
				id: "link-description",
				name: "Link in description",
				purpose: "call-to-action",
				layers: [
					text(
						L(
							"Link in the description ↓",
							"ලින්ක් එක විස්තරයේ ↓",
							"Link එක description එකේ ↓",
						),
						{ anchor: "b", w: 0.6, h: 0.1 },
						{ size: 15, color: "dark", background: "accent", style: slideUp },
					),
				],
			},
			{
				id: "end-screen",
				name: "End screen",
				purpose: "end-screen",
				aspects: ["16:9"],
				layers: [
					shape(
						{ anchor: "c", w: 1.2, h: 1.2, duration: 20 },
						{ color: "dark" },
					),
					text(
						L("Thanks for watching", "නැරඹුවාට ස්තූතියි", "Watch කළාට thanks!"),
						{ anchor: "t", w: 0.7, h: 0.12, duration: 20 },
						{ size: 26, font: "heading", style: fade },
					),
					// Empty boxes where the video and playlist end-screen elements go.
					shape(
						{ anchor: "l", w: 0.42, h: 0.42, dx: 0.04, duration: 20 },
						{ color: "light", radius: 16, opacity: 0.15 },
					),
					text(
						L("Next video", "ඊළඟ වීඩියෝව", "Next video එක"),
						{ anchor: "l", w: 0.42, h: 0.42, dx: 0.04, duration: 20 },
						{ size: 12, style: fade },
					),
					shape(
						{ anchor: "r", w: 0.42, h: 0.42, dx: -0.04, duration: 20 },
						{ color: "light", radius: 16, opacity: 0.15 },
					),
					text(
						L("Playlist", "ප්ලේලිස්ට් එක", "Playlist එක"),
						{ anchor: "r", w: 0.42, h: 0.42, dx: -0.04, duration: 20 },
						{ size: 12, style: fade },
					),
					text(
						subscribe,
						{ anchor: "b", w: 0.3, h: 0.1, duration: 20 },
						{ size: 14, font: "heading", background: "primary", style: pop },
					),
				],
			},
			{
				id: "thumbnail-headline",
				name: "Thumbnail headline",
				purpose: "title",
				layers: [
					text(
						same("{title}"),
						{ anchor: "l", w: 0.6, h: 0.4, duration: 5 },
						{
							size: 44,
							font: "heading",
							color: "accent",
							style: {
								"stroke.enabled": true,
								"stroke.color": "#000000",
								"stroke.width": 6,
								...pop,
							},
						},
					),
				],
			},
		],
	},
	{
		id: "facebook",
		name: "Facebook",
		description:
			"Post headlines, Reels captions, live banners, event and offer cards for every feed shape.",
		aspects: ["1:1", "4:5", "9:16", "16:9"],
		safe: {
			"1:1": { top: 0.06, right: 0.06, bottom: 0.06, left: 0.06 },
			"4:5": { top: 0.06, right: 0.06, bottom: 0.08, left: 0.06 },
			"9:16": { top: 0.12, right: 0.16, bottom: 0.24, left: 0.05 },
			"16:9": { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
		},
		palette: {
			primary: "#1E66F5",
			accent: "#22D3EE",
			dark: "#0B1220",
			light: "#FFFFFF",
		},
		fonts: { heading: "Montserrat", body: "Inter" },
		templates: [
			{
				id: "headline",
				name: "Post headline",
				purpose: "title",
				layers: [
					shape(
						{ anchor: "t", w: 1, h: 0.3 },
						{ color: "primary", radius: 24, opacity: 0.92 },
					),
					text(
						same("{title}"),
						{ anchor: "t", w: 0.9, h: 0.3 },
						{ size: 26, font: "heading" },
					),
				],
			},
			{
				id: "reels-caption",
				name: "Reels caption",
				purpose: "captions",
				layers: [
					text(
						L(
							"Your caption goes here",
							"ඔබේ උපසිරැසිය මෙතැන",
							"ඔයාගේ caption එක මෙතන",
						),
						{ anchor: "b", w: 0.9, h: 0.14, duration: 5 },
						{
							size: 18,
							font: "heading",
							background: "dark",
							style: { "animation.caption": "words" },
						},
					),
				],
			},
			{
				id: "live",
				name: "Live banner",
				purpose: "title",
				layers: [
					text(
						L("LIVE", "සජීවී", "LIVE"),
						{ anchor: "tl", w: 0.16, h: 0.08, duration: 8 },
						{ size: 14, font: "heading", background: "#E11D48", style: pop },
					),
					text(
						same("{topic}"),
						{
							anchor: "tl",
							w: 0.6,
							h: 0.08,
							dx: 0.18,
							duration: 8,
							start: 0.3,
						},
						{ size: 14, background: "dark", style: slideLeft },
					),
				],
			},
			{
				id: "event",
				name: "Event promo",
				purpose: "promo",
				layers: [
					shape(
						{ anchor: "c", w: 1.2, h: 1.2, duration: 6 },
						{ color: "dark", opacity: 0.6 },
					),
					text(
						L("Join us", "අප හා එක්වන්න", "Join වෙන්න"),
						{ anchor: "c", w: 0.8, h: 0.1, dy: -0.18, duration: 6 },
						{ size: 16, color: "accent" },
					),
					text(
						same("{title}"),
						{ anchor: "c", w: 0.9, h: 0.2, duration: 6, start: 0.4 },
						{ size: 30, font: "heading" },
					),
					text(
						same("{date} · {time} · {place}"),
						{ anchor: "c", w: 0.9, h: 0.1, dy: 0.18, duration: 6, start: 0.8 },
						{ size: 13, background: "primary" },
					),
				],
			},
			{
				id: "sale",
				name: "Offer badge",
				purpose: "promo",
				layers: [
					shape(
						{ anchor: "tr", w: 0.3, h: 0.3 },
						{
							color: "#E11D48",
							shape: "ellipse",
							animation: {
								"animation.in": "spin",
								"animation.inDuration": 0.6,
								...fadeOut,
							},
						},
					),
					text(
						L("{discount} OFF", "{discount} වට්ටම්", "{discount} OFF"),
						{ anchor: "tr", w: 0.3, h: 0.3 },
						{ size: 20, font: "heading", style: pop },
					),
					text(
						L("Limited time only", "සීමිත කාලයකට පමණයි", "Limited time විතරයි"),
						{ anchor: "b", w: 0.7, h: 0.08, start: 0.6 },
						{ size: 13, color: "dark", background: "light" },
					),
				],
			},
			{
				id: "testimonial",
				name: "Testimonial card",
				purpose: "promo",
				layers: [
					shape(
						{ anchor: "c", w: 0.9, h: 0.6, duration: 6 },
						{ color: "light", radius: 28, opacity: 0.96, animation: pop },
					),
					text(
						L(
							"What our customers say",
							"අපේ පාරිභෝගිකයින් කියන දේ",
							"Customers කියන දේ",
						),
						{ anchor: "c", w: 0.8, h: 0.08, dy: -0.2, duration: 6 },
						{ size: 11, color: "primary", font: "heading", style: pop },
					),
					text(
						same("“{quote}”"),
						{ anchor: "c", w: 0.8, h: 0.25, duration: 6, start: 0.4 },
						{ size: 20, color: "dark", style: fade },
					),
					text(
						same("— {name}"),
						{ anchor: "c", w: 0.8, h: 0.08, dy: 0.2, duration: 6, start: 0.8 },
						{ size: 12, color: "primary", style: fade },
					),
				],
			},
			lowerThird(
				"page-lower-third",
				"Page name lower third",
				same("{page}"),
				same("@{handle}"),
			),
			{
				id: "follow",
				name: "Follow the page",
				purpose: "call-to-action",
				layers: [
					text(
						L("Follow {page}", "{page} ෆලෝ කරන්න", "{page} Follow කරන්න"),
						{ anchor: "b", w: 0.7, h: 0.1 },
						{ size: 16, font: "heading", background: "primary", style: pop },
					),
				],
			},
			{
				id: "question",
				name: "Question / poll prompt",
				purpose: "call-to-action",
				layers: [
					shape(
						{ anchor: "c", w: 0.85, h: 0.35 },
						{ color: "accent", radius: 30, animation: pop },
					),
					text(
						L(
							"What do you think?",
							"ඔබ හිතන්නේ මොකක්ද?",
							"ඔයා හිතන්නේ මොකක්ද?",
						),
						{ anchor: "c", w: 0.8, h: 0.15, dy: -0.04 },
						{ size: 22, font: "heading", color: "dark", style: pop },
					),
					text(
						L(
							"Tell us in the comments",
							"කමෙන්ට් එකක් දාන්න",
							"Comment එකක් දාන්න",
						),
						{ anchor: "c", w: 0.8, h: 0.08, dy: 0.08, start: 0.5 },
						{ size: 12, color: "dark" },
					),
				],
			},
			{
				id: "quote",
				name: "Quote post",
				purpose: "title",
				layers: [
					shape({ anchor: "c", w: 1.2, h: 1.2 }, { color: "primary" }),
					text(
						same("“{quote}”"),
						{ anchor: "c", w: 0.85, h: 0.4 },
						{ size: 26, font: "heading", style: fade },
					),
				],
			},
			{
				id: "announcement",
				name: "Announcement",
				purpose: "title",
				layers: [
					text(
						L("Announcement", "නිවේදනය", "Announcement එකක්"),
						{ anchor: "t", w: 0.6, h: 0.08 },
						{ size: 12, color: "dark", background: "accent", style: pop },
					),
					text(
						same("{title}"),
						{ anchor: "c", w: 0.9, h: 0.3, start: 0.4 },
						{ size: 28, font: "heading" },
					),
				],
			},
			{
				id: "thanks",
				name: "Thanks card",
				purpose: "end-screen",
				layers: [
					shape({ anchor: "c", w: 1.2, h: 1.2 }, { color: "dark" }),
					logo({ anchor: "c", w: 0.14, h: 0.16, dy: 0.22, start: 0.4 }),
					text(
						L("Thank you!", "ස්තූතියි!", "Thank you!"),
						{ anchor: "c", w: 0.8, h: 0.16, dy: -0.05 },
						{ size: 32, font: "heading", style: pop },
					),
					text(
						L("Follow {page}", "{page} ෆලෝ කරන්න", "{page} Follow කරන්න"),
						{ anchor: "c", w: 0.8, h: 0.08, dy: 0.1, start: 0.5 },
						{ size: 13, color: "accent" },
					),
				],
			},
		],
	},
	{
		id: "tiktok",
		name: "TikTok",
		description:
			"Hooks, word-pop captions, part labels and follow prompts, kept clear of the side buttons and caption bar.",
		aspects: ["9:16"],
		safe: { "9:16": { top: 0.12, right: 0.16, bottom: 0.22, left: 0.05 } },
		palette: {
			primary: "#FE2C55",
			accent: "#25F4EE",
			dark: "#000000",
			light: "#FFFFFF",
		},
		fonts: { heading: "Bebas Neue", body: "Inter" },
		templates: [
			{
				id: "hook",
				name: "Hook (first 2 seconds)",
				purpose: "intro",
				layers: [
					text(
						L("Wait for it…", "අන්තිමට බලන්න…", "අන්තිම වෙනකම් බලන්න…"),
						{ anchor: "t", w: 1, h: 0.14, start: 0, duration: 2 },
						{
							size: 30,
							font: "heading",
							style: {
								"stroke.enabled": true,
								"stroke.color": "#000000",
								"stroke.width": 5,
								...pop,
							},
						},
					),
				],
			},
			{
				id: "word-pop",
				name: "Word-pop captions",
				purpose: "captions",
				layers: [
					text(
						L("one word at a time", "එක වචනයක් බැගින්", "එක word එකක් බැගින්"),
						{ anchor: "c", w: 1, h: 0.16, dy: 0.15, duration: 4 },
						{
							size: 30,
							font: "heading",
							style: {
								"animation.caption": "words-fast",
								"stroke.enabled": true,
								"stroke.color": "#000000",
								"stroke.width": 6,
							},
						},
					),
				],
			},
			{
				id: "reply",
				name: "Comment reply bubble",
				purpose: "title",
				layers: [
					shape(
						{ anchor: "tl", w: 0.8, h: 0.12 },
						{ color: "light", radius: 28, animation: pop },
					),
					text(
						L(
							"Replying to @{handle}",
							"@{handle} ට පිළිතුර",
							"@{handle} ට reply",
						),
						{ anchor: "tl", w: 0.76, h: 0.05, dx: 0.03, dy: 0.012 },
						{ size: 9, color: "#6B7280", style: pop },
					),
					text(
						same("{topic}"),
						{ anchor: "tl", w: 0.76, h: 0.06, dx: 0.03, dy: 0.05, start: 0.3 },
						{ size: 13, color: "dark", style: pop },
					),
				],
			},
			{
				id: "part",
				name: "Part 1 / Part 2 label",
				purpose: "title",
				layers: [
					text(
						L("Part {part}", "{part} කොටස", "Part {part}"),
						{ anchor: "tl", w: 0.4, h: 0.07, duration: 3 },
						{ size: 18, font: "heading", background: "primary", style: pop },
					),
				],
			},
			{
				id: "steps",
				name: "Step-by-step list",
				purpose: "title",
				layers: [
					text(
						L("Step 1", "පියවර 1", "Step 1"),
						{
							anchor: "l",
							w: 0.8,
							h: 0.07,
							dy: -0.12,
							start: 0.2,
							duration: 6,
						},
						{ size: 16, background: "dark", style: slideLeft },
					),
					text(
						L("Step 2", "පියවර 2", "Step 2"),
						{ anchor: "l", w: 0.8, h: 0.07, start: 1.6, duration: 4.6 },
						{ size: 16, background: "dark", style: slideLeft },
					),
					text(
						L("Step 3", "පියවර 3", "Step 3"),
						{ anchor: "l", w: 0.8, h: 0.07, dy: 0.12, start: 3, duration: 3.2 },
						{ size: 16, background: "dark", style: slideLeft },
					),
				],
			},
			{
				id: "pov",
				name: "POV title",
				purpose: "title",
				layers: [
					text(
						same("POV: {title}"),
						{ anchor: "t", w: 1, h: 0.12 },
						{
							size: 20,
							font: "heading",
							background: "light",
							color: "dark",
							style: pop,
						},
					),
				],
			},
			{
				id: "storytime",
				name: "Storytime title",
				purpose: "title",
				layers: [
					text(
						L("Storytime", "කතාවක්", "Storytime එකක්"),
						{ anchor: "t", w: 0.8, h: 0.1 },
						{ size: 26, font: "heading", color: "accent", style: pop },
					),
					text(
						same("{title}"),
						{ anchor: "t", w: 1, h: 0.1, dy: 0.1, start: 0.4 },
						{ size: 15 },
					),
				],
			},
			{
				id: "trending-caption",
				name: "Trending caption look",
				purpose: "captions",
				layers: [
					text(
						L(
							"this changed everything",
							"මේකෙන් හැමදේම වෙනස් වුණා",
							"මේකෙන් everything change වුණා",
						),
						{ anchor: "c", w: 1, h: 0.14, dy: 0.2, duration: 4 },
						{
							size: 24,
							font: "heading",
							color: "#FFE14D",
							style: {
								"animation.caption": "words",
								"stroke.enabled": true,
								"stroke.color": "#000000",
								"stroke.width": 7,
							},
						},
					),
				],
			},
			{
				id: "follow",
				name: "Follow prompt",
				purpose: "call-to-action",
				layers: [
					text(
						L(
							"Follow for more",
							"තවත් දේ සඳහා ෆලෝ කරන්න",
							"තව ඕනේ නම් Follow කරන්න",
						),
						{ anchor: "b", w: 1, h: 0.08 },
						{ size: 16, font: "heading", background: "primary", style: pop },
					),
					text(
						same("@{handle}"),
						{ anchor: "b", w: 1, h: 0.06, dy: -0.1, start: 0.4 },
						{ size: 13 },
					),
				],
			},
			{
				id: "duet",
				name: "Duet label",
				purpose: "title",
				layers: [
					text(
						L("Duet", "ඩුවට්", "Duet"),
						{ anchor: "tl", w: 0.3, h: 0.06 },
						{ size: 14, background: "dark", style: pop },
					),
				],
			},
			{
				id: "stitch",
				name: "Stitch label",
				purpose: "title",
				layers: [
					text(
						L(
							"Stitch with @{handle}",
							"@{handle} සමඟ ස්ටිච්",
							"@{handle} එක්ක Stitch",
						),
						{ anchor: "tl", w: 0.6, h: 0.06 },
						{ size: 14, background: "dark", style: pop },
					),
				],
			},
			{
				id: "countdown",
				name: "3-2-1 countdown",
				purpose: "intro",
				layers: [
					text(
						same("3"),
						{ anchor: "c", w: 0.5, h: 0.2, start: 0, duration: 1 },
						{ size: 80, font: "heading", color: "accent", style: pop },
					),
					text(
						same("2"),
						{ anchor: "c", w: 0.5, h: 0.2, start: 1, duration: 1 },
						{ size: 80, font: "heading", color: "primary", style: pop },
					),
					text(
						same("1"),
						{ anchor: "c", w: 0.5, h: 0.2, start: 2, duration: 1 },
						{ size: 80, font: "heading", style: pop },
					),
				],
			},
		],
	},
	{
		id: "podcast",
		name: "Podcast",
		description:
			"Episode cards, host and guest lower thirds, quote and audiogram cards, sponsor breaks.",
		aspects: ["16:9", "1:1", "9:16"],
		safe: {
			"16:9": { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
			"1:1": { top: 0.06, right: 0.06, bottom: 0.06, left: 0.06 },
			"9:16": { top: 0.1, right: 0.12, bottom: 0.2, left: 0.05 },
		},
		palette: {
			primary: "#7C3AED",
			accent: "#F59E0B",
			dark: "#0F0A1E",
			light: "#FFFFFF",
		},
		fonts: { heading: "Montserrat", body: "Inter" },
		templates: [
			{
				id: "episode-card",
				name: "Episode title card",
				purpose: "intro",
				layers: [
					shape(
						{ anchor: "c", w: 1.2, h: 1.2, duration: 5 },
						{ color: "dark" },
					),
					text(
						same("{show}"),
						{ anchor: "c", w: 0.8, h: 0.08, dy: -0.2, duration: 5 },
						{ size: 14, color: "accent" },
					),
					text(
						L("Episode {episode}", "කථාංගය {episode}", "Episode {episode}"),
						{ anchor: "c", w: 0.8, h: 0.08, dy: -0.1, duration: 5, start: 0.3 },
						{ size: 12, background: "primary" },
					),
					text(
						same("{title}"),
						{
							anchor: "c",
							w: 0.85,
							h: 0.25,
							dy: 0.08,
							duration: 5,
							start: 0.6,
						},
						{ size: 28, font: "heading" },
					),
				],
			},
			lowerThird(
				"host",
				"Host lower third",
				same("{host}"),
				L("Host", "සත්කාරක", "Host"),
			),
			lowerThird(
				"guest",
				"Guest lower third",
				same("{guest}"),
				L("Guest", "ආරාධිත අමුත්තා", "Guest"),
			),
			{
				id: "speaker",
				name: "Speaker name label",
				purpose: "lower-third",
				layers: [
					text(
						same("{name}"),
						{ anchor: "bl", w: 0.35, h: 0.07, duration: 6 },
						{ size: 13, background: "primary", style: fade },
					),
				],
			},
			{
				id: "quote",
				name: "Quote card",
				purpose: "title",
				layers: [
					shape(
						{ anchor: "c", w: 1.2, h: 1.2, duration: 6 },
						{ color: "primary" },
					),
					text(
						same("“{quote}”"),
						{ anchor: "c", w: 0.85, h: 0.4, duration: 6 },
						{ size: 26, font: "heading", style: fade },
					),
					text(
						same("— {guest}, {show}"),
						{ anchor: "c", w: 0.8, h: 0.08, dy: 0.25, duration: 6, start: 0.8 },
						{ size: 12, color: "accent" },
					),
				],
			},
			{
				id: "audiogram",
				name: "Audiogram card",
				purpose: "captions",
				layers: [
					shape(
						{ anchor: "c", w: 1.2, h: 1.2, duration: 8 },
						{ color: "dark" },
					),
					text(
						same("{show}"),
						{ anchor: "t", w: 0.8, h: 0.08, duration: 8 },
						{ size: 14, color: "accent" },
					),
					// Bars follow the timeline's sound when it has any; they pulse otherwise (SP-13).
					...[-0.2, -0.1, 0, 0.1, 0.2].map((dx, i) =>
						shape(
							{
								anchor: "c",
								w: 0.05,
								h: 0.2 + (i % 2) * 0.1,
								dx,
								dy: -0.05,
								duration: 8,
							},
							{
								color: "primary",
								radius: 12,
								audioBar: i,
								animation: {
									"animation.combo": "pulse",
									"animation.comboSpeed": 1.5 + i * 0.3,
								},
							},
						),
					),
					text(
						L(
							"Your caption goes here",
							"ඔබේ උපසිරැසිය මෙතැන",
							"ඔයාගේ caption එක මෙතන",
						),
						{ anchor: "b", w: 0.9, h: 0.14, duration: 8 },
						{ size: 18, style: { "animation.caption": "words" } },
					),
				],
			},
			{
				id: "chapter",
				name: "Chapter title",
				purpose: "title",
				layers: [
					text(
						L("Chapter {chapter}", "කොටස {chapter}", "Chapter {chapter}"),
						{ anchor: "tl", w: 0.4, h: 0.06 },
						{ size: 11, color: "accent", style: slideLeft },
					),
					text(
						same("{chapterTitle}"),
						{ anchor: "tl", w: 0.7, h: 0.1, dy: 0.07, start: 0.3 },
						{ size: 22, font: "heading", style: slideLeft },
					),
				],
			},
			{
				id: "new-episode",
				name: "New episode promo",
				purpose: "promo",
				layers: [
					text(
						L("New episode", "නව කථාංගය", "New episode එක"),
						{ anchor: "t", w: 0.6, h: 0.08 },
						{ size: 14, color: "dark", background: "accent", style: pop },
					),
					text(
						same("{title}"),
						{ anchor: "c", w: 0.9, h: 0.25, start: 0.4 },
						{ size: 28, font: "heading" },
					),
					text(
						L("Out now", "දැන් ලබාගත හැක", "දැන් out"),
						{ anchor: "b", w: 0.5, h: 0.08, start: 0.8 },
						{ size: 14, background: "primary" },
					),
				],
			},
			{
				id: "sponsor",
				name: "Sponsor break",
				purpose: "promo",
				layers: [
					shape(
						{ anchor: "c", w: 0.9, h: 0.4 },
						{ color: "light", radius: 28, animation: pop },
					),
					text(
						L(
							"This episode is supported by",
							"මෙම කථාංගයට අනුග්‍රහය",
							"මේ episode එකට support කරන්නේ",
						),
						{ anchor: "c", w: 0.8, h: 0.08, dy: -0.08 },
						{ size: 12, color: "primary", style: pop },
					),
					text(
						same("{sponsor}"),
						{ anchor: "c", w: 0.8, h: 0.14, dy: 0.06, start: 0.4 },
						{ size: 26, color: "dark", font: "heading", style: pop },
					),
				],
			},
			{
				id: "subscribe",
				name: "Subscribe prompt (audio apps)",
				purpose: "call-to-action",
				layers: [
					text(
						L(
							"Listen on your favourite podcast app",
							"ඔබ කැමති පොඩ්කාස්ට් ඇප් එකෙන් අහන්න",
							"ඔයා කැමති podcast app එකෙන් අහන්න",
						),
						{ anchor: "b", w: 0.9, h: 0.1 },
						{ size: 14, background: "primary", style: slideUp },
					),
					text(
						subscribe,
						{ anchor: "b", w: 0.4, h: 0.08, dy: -0.13, start: 0.5 },
						{ size: 14, color: "dark", background: "accent", style: pop },
					),
				],
			},
			{
				id: "topic",
				name: "Topic banner",
				purpose: "title",
				layers: [
					text(
						same("{topic}"),
						{ anchor: "t", w: 0.9, h: 0.08, duration: 8 },
						{ size: 14, background: "dark", style: slideUp },
					),
				],
			},
			{
				id: "outro",
				name: "Outro thanks",
				purpose: "end-screen",
				layers: [
					shape(
						{ anchor: "c", w: 1.2, h: 1.2, duration: 6 },
						{ color: "dark" },
					),
					logo({ anchor: "c", w: 0.14, h: 0.16, dy: -0.24, start: 0.3, duration: 6 }),
					text(
						L(
							"Thanks for listening",
							"සවන් දුන්නාට ස්තූතියි",
							"Listen කළාට thanks!",
						),
						{ anchor: "c", w: 0.85, h: 0.15, dy: -0.06, duration: 6 },
						{ size: 28, font: "heading", style: pop },
					),
					text(
						same("{show}"),
						{ anchor: "c", w: 0.8, h: 0.08, dy: 0.1, duration: 6, start: 0.5 },
						{ size: 14, color: "accent" },
					),
				],
			},
		],
	},
];
