import type { LutEntry } from "./library";

/**
 * What a LUT outputs (SRS HD-11). Camera LUTs and almost all creative
 * LUTs make Rec. 709 SDR; ones named for HLG, PQ / ST 2084 or Rec. 2100
 * make HDR. An SDR LUT on an HDR project's HLG signal would crush
 * highlights, so it isn't applied there without asking.
 */
export type LutOutput = "sdr" | "hdr";

const HDR_NAME =
	/(^|[^a-z0-9])(hlg|pq|st[ ._-]?2084|smpte[ ._-]?2084|(rec|bt|itu)[ ._-]?2100|hdr10?|2100)([^a-z0-9]|$)/i;

export function detectLutOutput({
	name,
	title = "",
}: {
	name: string;
	title?: string;
}): LutOutput {
	return HDR_NAME.test(`${name} ${title}`) ? "hdr" : "sdr";
}

export function lutOutput(
	lut: Pick<LutEntry, "output" | "name" | "fileName">,
): LutOutput {
	return lut.output ?? detectLutOutput({ name: `${lut.name} ${lut.fileName}` });
}

/** True when this LUT shouldn't go on clips of this project without asking. */
export function needsHdrWarning({
	lut,
	colorSpace,
}: {
	lut: Pick<LutEntry, "output" | "name" | "fileName">;
	colorSpace: string | undefined;
}): boolean {
	return (
		(colorSpace === "hlg" || colorSpace === "pq") && lutOutput(lut) === "sdr"
	);
}
