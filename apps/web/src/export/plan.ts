import type { WorksuiteProfile } from "@/account/types";

/**
 * Plan labels for export options (SRS EX-26). The account server decides:
 * a feature listed as "gate:<key>" is a plan feature, and "<key>" means
 * this account has it. Nothing is gated unless the server says so, and
 * resolutions up to 4K without AI are never gated.
 */
export type ExportFeature = "ai-ultra-hd" | "optical-flow" | "export-8k";

export interface FeatureAccess {
	allowed: boolean;
	/** Badge text, or null for no badge. */
	label: string | null;
}

export function featureAccess({
	profile,
	feature,
}: {
	profile: WorksuiteProfile | null;
	feature: ExportFeature;
}): FeatureAccess {
	const features = profile?.features ?? [];
	if (!features.includes(`gate:${feature}`))
		return { allowed: true, label: null };
	if (features.includes(feature))
		return { allowed: true, label: profile?.plan ?? "Included" };
	return { allowed: false, label: profile?.plan ? "Upgrade" : "Plan feature" };
}
