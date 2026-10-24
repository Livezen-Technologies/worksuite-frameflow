/**
 * Where the frames of a video clip's filmstrip go on the timeline and which
 * source moment each one shows. Tiles follow the clip's trim and speed, so
 * trimming, moving, zooming or retiming shows the right frames.
 */

export interface FilmstripTile {
	/** Offset from the clip's left edge, px. */
	left: number;
	width: number;
	/** Source time this tile shows, seconds (snapped so zoom levels share frames). */
	sourceTime: number;
}

/** Above this many tiles a clip shows only its poster frame, to keep the DOM small. */
export const MAX_FILMSTRIP_TILES = 3000;

/**
 * Snap step for source times: the largest power of two not longer than the
 * time one tile covers, so a snapped frame always falls inside its tile and
 * zoom levels share frames.
 */
export function filmstripStep(secondsPerTile: number): number {
	const exponent = Math.floor(Math.log2(Math.max(secondsPerTile, 1e-6)));
	return Math.min(600, Math.max(1 / 16, 2 ** exponent));
}

export function filmstripTiles({
	duration,
	trimStart,
	rate = 1,
	sourceDuration,
	pixelsPerSecond,
	tileWidth,
}: {
	/** Clip length on the timeline, seconds. */
	duration: number;
	/** Seconds trimmed off the start of the source. */
	trimStart: number;
	/** Playback rate (2 = twice as fast). */
	rate?: number;
	/** Source length, seconds, when known. */
	sourceDuration?: number;
	pixelsPerSecond: number;
	tileWidth: number;
}): FilmstripTile[] {
	const width = duration * pixelsPerSecond;
	if (!(width > 0) || !(tileWidth > 0) || !(pixelsPerSecond > 0)) return [];
	const count = Math.ceil(width / tileWidth);
	if (count > MAX_FILMSTRIP_TILES) return [];
	const speed = rate > 0 ? rate : 1;
	const step = filmstripStep((tileWidth / pixelsPerSecond) * speed);
	const last = sourceDuration && sourceDuration > 0 ? Math.max(0, sourceDuration - 1 / 60) : Number.POSITIVE_INFINITY;
	const tiles: FilmstripTile[] = [];
	for (let i = 0; i < count; i++) {
		const left = i * tileWidth;
		const tileW = Math.min(tileWidth, width - left);
		// The first grid moment at or after the tile's left edge, in source time.
		const start = trimStart + (left / pixelsPerSecond) * speed;
		const snapped = Math.min(last, Math.max(0, Math.ceil(start / step - 1e-9) * step));
		tiles.push({ left, width: tileW, sourceTime: Number(snapped.toFixed(4)) });
	}
	return tiles;
}
