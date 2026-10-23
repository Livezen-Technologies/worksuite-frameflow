/**
 * Speaker names in captions and transcripts (SRS SP-06): WebVTT voice tags
 * (`<v Kasun Perera>`) and "Name:" at the start of a line, most frequent
 * first, so host and guest lower thirds can be filled in.
 */

const VOICE = /<v(?:\.[^\s>]+)?\s+([^>]+)>/g;
// A short name (up to four words, Latin, Sinhala or Tamil letters) then a colon.
const PREFIX = /^\s*((?:[\p{Lu}඀-෿஀-௿][\p{L}\p{M}.'’-]*)(?:\s+[\p{L}\p{M}.'’-]+){0,3})\s*:\s+\S/u;
const NOT_NAMES = new Set(["note", "warning", "http", "https", "music", "q", "a", "re"]);

export function speakersIn({ lines }: { lines: string[] }): { name: string; count: number }[] {
	const counts = new Map<string, number>();
	const add = (raw: string) => {
		const name = raw.trim().replace(/\s+/g, " ");
		if (!name || name.length > 40 || NOT_NAMES.has(name.toLowerCase())) return;
		counts.set(name, (counts.get(name) ?? 0) + 1);
	};
	for (const line of lines) {
		let voiced = false;
		for (const match of line.matchAll(VOICE)) {
			add(match[1]);
			voiced = true;
		}
		if (voiced) continue;
		for (const part of line.split("\n")) {
			const match = PREFIX.exec(part);
			if (match) add(match[1]);
		}
	}
	return [...counts]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count);
}

/** Host = who speaks most, guest = the next (SP-06). */
export function hostAndGuest({ lines }: { lines: string[] }): { host?: string; guest?: string } {
	const [host, guest] = speakersIn({ lines });
	return { ...(host ? { host: host.name } : {}), ...(guest ? { guest: guest.name } : {}) };
}
