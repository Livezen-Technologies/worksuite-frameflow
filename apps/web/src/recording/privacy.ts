/** Password managers and similar, paused for by default (SC-08). */
export const DEFAULT_PROTECTED = ["1Password", "Bitwarden", "KeePass", "LastPass", "Dashlane", "Keychain Access", "Proton Pass"];

/** The first open window whose title names a protected app, ignoring case. */
export function findProtected({
	windows,
	patterns,
}: {
	windows: string[];
	patterns: string[];
}): string | null {
	const wanted = patterns.map((p) => p.trim().toLowerCase()).filter(Boolean);
	for (const name of windows) {
		const lower = name.toLowerCase();
		const hit = wanted.find((p) => lower.includes(p));
		if (hit) return patterns.find((p) => p.trim().toLowerCase() === hit)?.trim() ?? name;
	}
	return null;
}

export function parsePatterns(text: string): string[] {
	return text
		.split(",")
		.map((p) => p.trim())
		.filter(Boolean)
		.slice(0, 40);
}
