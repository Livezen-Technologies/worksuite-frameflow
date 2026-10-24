import type { PackIndexAsset } from "@/lottie/catalog";
import { lottieDataFromPackAsset } from "@/lottie/element";
import type { LottieElementData } from "@/lottie/types";

/*
 * Clips added from a pack that is still downloading. They draw a
 * "Downloading pack…" placeholder (see drawLottieFrame) and keep the
 * project editable offline; once the pack is installed they take the
 * asset's real size and length, keeping every user edit.
 */

const FPS = 30;

/** A clip for `assetId` of a pack that isn't installed yet. */
export function placeholderLottieData({
	packId,
	version,
	assetId,
	variant,
}: {
	packId: string;
	version: string;
	assetId: string;
	variant?: string | null;
}): LottieElementData {
	return {
		source: { kind: "pack", assetId, ...(variant ? { variant } : {}), pack: { id: packId, version } },
		colors: {},
		width: 1080,
		height: 1080,
		fps: FPS,
		frames: 3 * FPS,
		loop: false,
		speed: 1,
		placeholder: true,
	};
}

/** The placeholder resolved against the installed asset: real size and length, edits kept. */
export function resolvePlaceholderData(data: LottieElementData, asset: PackIndexAsset): LottieElementData {
	if (!data.placeholder || data.source.kind !== "pack") return data;
	const real = lottieDataFromPackAsset(asset, data.source.variant);
	const { placeholder: _placeholder, ...rest } = data;
	return {
		...rest,
		width: real.width,
		height: real.height,
		fps: real.fps,
		frames: real.frames,
		loop: real.loop,
		source: { ...data.source, ...(asset.pack ? { pack: { ...asset.pack } } : {}) },
	};
}
