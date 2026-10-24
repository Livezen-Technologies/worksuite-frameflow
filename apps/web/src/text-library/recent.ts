export const RECENT_LIMIT = 24;

/** Most recent first, no duplicates, capped. */
export function pushRecent(recent: string[], key: string, limit = RECENT_LIMIT): string[] {
	return [key, ...recent.filter((k) => k !== key)].slice(0, limit);
}
