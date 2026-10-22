/**
 * Listeners called right after the compositor draws a frame, while its
 * WebGPU canvas can still be read (it can't once the frame is presented).
 * The Color panel's scopes use this to sample the preview.
 */
type FrameTap = (canvas: HTMLCanvasElement) => void;

const taps = new Set<FrameTap>();

export function addFrameTap(tap: FrameTap): () => void {
	taps.add(tap);
	return () => taps.delete(tap);
}

export function notifyFrameRendered(canvas: HTMLCanvasElement): void {
	for (const tap of taps) tap(canvas);
}
