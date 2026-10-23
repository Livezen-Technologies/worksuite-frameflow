import type { SyncedSetting } from "@/account/types";

/**
 * Key-by-key merge for settings sync (CL-01): the newer stamp wins; ties
 * keep the cloud copy so every device converges on the same value.
 */
export function mergeSettings({
	local,
	remote,
}: {
	local: Record<string, SyncedSetting>;
	remote: Record<string, SyncedSetting>;
}): {
	merged: Record<string, SyncedSetting>;
	applyLocally: string[];
	pushNeeded: boolean;
} {
	const merged: Record<string, SyncedSetting> = {};
	const applyLocally: string[] = [];
	let pushNeeded = false;
	for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
		const mine = local[key];
		const theirs = remote[key];
		if (theirs && (!mine || theirs.updatedAt >= mine.updatedAt)) {
			merged[key] = theirs;
			if (
				!mine ||
				JSON.stringify(mine.value) !== JSON.stringify(theirs.value)
			) {
				applyLocally.push(key);
			}
		} else if (mine) {
			merged[key] = mine;
			pushNeeded = true;
		}
	}
	return { merged, applyLocally, pushNeeded };
}

/** A zustand saved value ({ state, version }) cut down to `fields`. */
export function pickFields({
	saved,
	fields,
	into,
}: {
	saved: unknown;
	fields: string[];
	into?: unknown;
}): unknown {
	const state = (value: unknown): Record<string, unknown> =>
		value &&
		typeof value === "object" &&
		"state" in value &&
		value.state &&
		typeof value.state === "object"
			? { ...value.state }
			: {};
	const source = state(saved);
	const picked = Object.fromEntries(
		fields.filter((f) => f in source).map((f) => [f, source[f]]),
	);
	if (into === undefined) return { state: picked };
	const base = into && typeof into === "object" ? into : {};
	return { ...base, state: { ...state(into), ...picked } };
}
