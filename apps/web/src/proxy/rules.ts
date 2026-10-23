import type { MediaAssetData } from "@/services/storage/types";

export type ProxyMode = "auto" | "always" | "off";

/** Bigger than 1080p (by pixel count) is where full-size decoding stutters. */
export const AUTO_PIXELS = 1920 * 1080;

/**
 * Whether a clip should get an editing proxy. HDR clips keep their
 * originals so preview colour stays exact (tone mapping needs them).
 */
export function needsProxy({
	asset,
	mode,
	height,
}: {
	asset: Pick<
		MediaAssetData,
		"type" | "width" | "height" | "color" | "ephemeral"
	>;
	mode: ProxyMode;
	height: number;
}): boolean {
	if (mode === "off" || asset.type !== "video" || asset.ephemeral) return false;
	if (asset.color && asset.color.transfer !== "sdr") return false;
	const w = asset.width ?? 0;
	const h = asset.height ?? 0;
	// A proxy no smaller than the source would only cost time.
	if (h && Math.min(w, h) <= height) return false;
	return mode === "always" || w * h > AUTO_PIXELS;
}

export const PROXY_HEIGHTS = [540, 720, 1080] as const;

/**
 * 360° clips are seen a slice at a time, so their proxies stay sharper:
 * 2880×1440 equirectangular (SRS VR-05), never above the original.
 */
export const SPHERE_PROXY_HEIGHT = 1440;

export function proxyHeightFor({
	asset,
	height,
	sphere,
}: {
	asset: Pick<MediaAssetData, "height">;
	height: number;
	sphere: boolean;
}): number {
	if (!sphere) return height;
	const target = Math.max(height, SPHERE_PROXY_HEIGHT);
	return asset.height ? Math.min(target, asset.height) : target;
}
