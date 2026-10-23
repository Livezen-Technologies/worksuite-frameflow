"use client";

import { useEffect, useState } from "react";
import { findPackAsset, packAssetThumbnailUrl } from "../catalog";
import type { LottieSource } from "../types";

/** The library thumbnail for a pack animation; null for imports or while loading. */
export function useLottieThumbnail(source: LottieSource | undefined): string | null {
	const assetId = source?.kind === "pack" ? source.assetId : null;
	const [thumbnail, setThumbnail] = useState<{ id: string; url: string | null } | null>(null);
	useEffect(() => {
		if (!assetId) return;
		let cancelled = false;
		findPackAsset(assetId)
			.then((asset) => !cancelled && setThumbnail({ id: assetId, url: asset ? packAssetThumbnailUrl(asset) : null }))
			.catch(() => !cancelled && setThumbnail({ id: assetId, url: null }));
		return () => {
			cancelled = true;
		};
	}, [assetId]);
	return assetId && thumbnail?.id === assetId ? thumbnail.url : null;
}
