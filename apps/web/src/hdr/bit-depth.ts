/**
 * Bit depth from a WebCodecs codec string (HD-14), so 10-bit SDR footage
 * (log profiles, 10-bit H.264/HEVC/VP9/AV1) is decoded at full precision.
 */
export function bitDepthFromCodec(codec: string | null | undefined): number {
	if (!codec) return 8;
	const parts = codec.split(".");
	const family = parts[0]?.toLowerCase();
	if (family === "vp09" && parts[3]) return Number.parseInt(parts[3], 10) || 8;
	if (family === "av01" && parts[3]) return Number.parseInt(parts[3], 10) || 8;
	if (family === "hvc1" || family === "hev1") {
		// Profile 2 is Main 10.
		const profile = (parts[1] ?? "").replace(/^[A-C]/i, "");
		return profile === "2" ? 10 : 8;
	}
	if (family === "avc1" || family === "avc3") {
		// High 10 (110), High 4:2:2 (122), High 4:4:4 (244).
		const profile = Number.parseInt((parts[1] ?? "").slice(0, 2), 16);
		return profile === 110 || profile === 122 || profile === 244 ? 10 : 8;
	}
	return 8;
}
