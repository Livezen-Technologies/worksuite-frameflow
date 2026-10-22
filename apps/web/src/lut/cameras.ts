/**
 * Camera LUT library (SRS WS-35, WS-43): brands, product lines, models and
 * log profiles. FrameFlow bundles no vendor LUT files (WS-39, WS-47): each
 * slot is filled when the user imports the vendor's official .cube.
 */
export type CameraBrand = "GoPro" | "Insta360" | "DJI";

export interface CameraModel {
	brand: CameraBrand;
	line: string;
	model: string;
	/** Strings that identify the model in file names and metadata. */
	aliases: string[];
	profiles: string[];
}

const GOPRO_PROFILES = ["GP-Log", "Protune Flat", "Native", "Vibrant"];
const DJI_PROFILES = ["D-Log", "D-Log M", "HLG", "Normal"];

export const CAMERA_MODELS: CameraModel[] = [
	...["HERO13 Black", "HERO12 Black", "HERO11 Black", "HERO10 Black"].map(
		(model) => ({
			brand: "GoPro" as const,
			line: "HERO",
			model,
			aliases: [model, model.replace(" Black", "")],
			profiles: GOPRO_PROFILES,
		}),
	),
	...["Ace Pro 2", "Ace Pro", "X5", "X4", "GO 3S"].map((model) => ({
		brand: "Insta360" as const,
		line: model.startsWith("Ace")
			? "Ace"
			: model.startsWith("X")
				? "X series"
				: "GO",
		model,
		aliases: [model, `Insta360 ${model}`],
		profiles: ["I-Log", "Normal"],
	})),
	...(
		[
			["Mavic/Air/Mini", "Mavic 3 Pro", ["Mavic 3 Pro", "Mavic3Pro", "M3P"]],
			["Mavic/Air/Mini", "Mavic 3", ["Mavic 3", "Mavic3", "M3"]],
			["Mavic/Air/Mini", "Air 3S", ["Air 3S", "Air3S"]],
			["Mavic/Air/Mini", "Air 3", ["Air 3", "Air3"]],
			["Mavic/Air/Mini", "Mini 4 Pro", ["Mini 4 Pro", "Mini4Pro", "FC8482"]],
			["Mavic/Air/Mini", "Mini 3 Pro", ["Mini 3 Pro", "Mini3Pro", "FC3582"]],
			["Avata", "Avata 2", ["Avata 2", "Avata2"]],
			[
				"Osmo Action",
				"Osmo Action 5 Pro",
				["Osmo Action 5 Pro", "Action 5 Pro", "OsmoAction5Pro", "AC005"],
			],
			[
				"Osmo Action",
				"Osmo Action 4",
				["Osmo Action 4", "Action 4", "OsmoAction4", "AC004"],
			],
			[
				"Osmo Pocket",
				"Osmo Pocket 3",
				["Osmo Pocket 3", "Pocket 3", "OsmoPocket3"],
			],
			["Ronin", "Ronin 4D", ["Ronin 4D", "Ronin4D"]],
		] satisfies [string, string, string[]][]
	).map(([line, model, aliases]) => ({
		brand: "DJI" as const,
		line,
		model,
		aliases,
		profiles: DJI_PROFILES,
	})),
];

export function cameraKey({
	brand,
	model,
}: {
	brand: CameraBrand;
	model: string;
}) {
	return `${brand}:${model}`;
}

/** Where to get the vendor's official LUTs (WS-39b, WS-47). */
export function officialLutUrl({
	brand,
	model,
}: {
	brand: CameraBrand;
	model?: string;
}) {
	switch (brand) {
		case "DJI":
			return `https://www.dji.com/search?q=${encodeURIComponent(`${model ?? ""} LUT`.trim())}`;
		case "GoPro":
			return "https://github.com/gopro/labs";
		case "Insta360":
			return "https://www.insta360.com/download";
	}
}

const PROFILE_PATTERNS: [RegExp, string][] = [
	[/d[\s_-]*log[\s_-]*m(?![a-z])/i, "D-Log M"],
	[/d[\s_-]*log(?![\s_-]*m(?![a-z]))/i, "D-Log"],
	[/\bhlg\b/i, "HLG"],
	[/gp[\s_-]*log|log[\s_-]*400/i, "GP-Log"],
	[/protune[\s_-]*flat|log[\s_-]*113/i, "Protune Flat"],
	[/i[\s_-]*log/i, "I-Log"],
	[/vibrant/i, "Vibrant"],
	[/native/i, "Native"],
];

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function matchModel(text: string): CameraModel | null {
	const haystack = squash(text);
	// Longest alias first, so "Mavic 3 Pro" wins over "Mavic 3".
	const candidates = CAMERA_MODELS.flatMap((camera) =>
		camera.aliases.map((alias) => ({ camera, alias: squash(alias) })),
	).sort((a, b) => b.alias.length - a.alias.length);
	return (
		candidates.find(
			({ alias }) => alias.length >= 2 && haystack.includes(alias),
		)?.camera ?? null
	);
}

/** Camera and profile from a LUT's file name or title (WS-44). */
export function identifyLutFile(name: string): {
	camera: CameraModel | null;
	brand: CameraBrand | null;
	profile: string | null;
} {
	const camera = matchModel(name);
	const brand: CameraBrand | null =
		camera?.brand ??
		(/dji|osmo|mavic|avata|ronin/i.test(name)
			? "DJI"
			: /gopro|protune|gp[\s_-]*log/i.test(name)
				? "GoPro"
				: /insta360|i[\s_-]*log/i.test(name)
					? "Insta360"
					: null);
	const profile =
		PROFILE_PATTERNS.find(([pattern]) => pattern.test(name))?.[1] ?? null;
	return { camera, brand, profile };
}

/**
 * Camera from a video file's first bytes (WS-36, WS-45): make/model strings
 * in the MP4 metadata. Profiles are rarely written, so the caller asks once
 * and remembers the answer per camera.
 */
export function identifyFootage(header: Uint8Array): {
	camera: CameraModel | null;
	brand: CameraBrand | null;
	profile: string | null;
} {
	let text = "";
	for (let i = 0; i < header.length; i++) {
		const b = header[i];
		text += b >= 32 && b < 127 ? String.fromCharCode(b) : " ";
	}
	const camera = matchModel(text);
	const brand: CameraBrand | null =
		camera?.brand ??
		(/\bDJI\b/.test(text)
			? "DJI"
			: /GoPro|GPMF/.test(text)
				? "GoPro"
				: /Insta360/i.test(text)
					? "Insta360"
					: null);
	const profile =
		brand === "DJI" && /D-?Log\s?M/i.test(text)
			? "D-Log M"
			: brand === "DJI" && /D-?Log/i.test(text)
				? "D-Log"
				: brand === "DJI" && /HLG/.test(text)
					? "HLG"
					: brand === "GoPro" && /GP-?Log|LOG400/i.test(text)
						? "GP-Log"
						: brand === "Insta360" && /I-?Log/i.test(text)
							? "I-Log"
							: null;
	return { camera, brand, profile };
}
