/**
 * Effects that can't work on an HDR project's signal (SRS HD-13). They
 * assume SDR levels, where 1.0 is paper white; in HDR 1.0 is the
 * brightest the display can go, so they would make full-brightness
 * pictures. Everything else works on the HDR signal.
 */
const HDR_UNSUPPORTED: Record<string, string> = {
	invert: "Inverting turns dark areas into peak HDR brightness.",
	"edge-detect": "Draws lines at full HDR brightness.",
	vhs: "Built around SDR video levels.",
};

export function hdrUnsupportedReason({
	effectType,
	colorSpace,
}: {
	effectType: string;
	colorSpace: string | undefined;
}): string | null {
	if (colorSpace !== "hlg" && colorSpace !== "pq") return null;
	return HDR_UNSUPPORTED[effectType] ?? null;
}
