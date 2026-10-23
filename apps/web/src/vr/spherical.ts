/**
 * Recognising 360° footage on import (SRS VR-01, VR-02, VR-03).
 */
export type SphereSource = "metadata" | "shape" | "manual";

export interface SphereInfo {
	is360: boolean;
	source: SphereSource | null;
	/** A 360° camera format FrameFlow can't read yet, with what to do. */
	unsupported?: string;
}

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

function indexOf({
	bytes,
	pattern,
}: {
	bytes: Uint8Array;
	pattern: number[];
}): number {
	outer: for (let i = 0; i + pattern.length <= bytes.length; i++) {
		for (let j = 0; j < pattern.length; j++) {
			if (bytes[i + j] !== pattern[j]) continue outer;
		}
		return i;
	}
	return -1;
}

const SV3D = ascii("sv3d");
const EQUI = ascii("equi");
const CBMP = ascii("cbmp");

/** Spherical Video V2 (sv3d box) or V1 (GSpherical XMP) in the file's bytes. */
export function hasSphericalMetadata(bytes: Uint8Array): boolean {
	const sv3d = indexOf({ bytes, pattern: SV3D });
	if (sv3d >= 0) {
		const rest = bytes.subarray(sv3d, sv3d + 512);
		if (
			indexOf({ bytes: rest, pattern: EQUI }) >= 0 ||
			indexOf({ bytes: rest, pattern: CBMP }) < 0
		) {
			return true;
		}
	}
	const text = new TextDecoder("latin1").decode(bytes);
	return (
		/GSpherical:Spherical>\s*true/i.test(text) ||
		/ProjectionType>\s*equirectangular/i.test(text)
	);
}

/** True for a 2:1 frame big enough to be a 360° video. */
export function hasSphereShape({
	width,
	height,
}: {
	width?: number;
	height?: number;
}): boolean {
	if (!width || !height || height < 960) return false;
	return Math.abs(width / height - 2) < 0.01;
}

export function unsupportedSphereFormat(fileName: string): string | null {
	if (/\.insv$/i.test(fileName)) {
		return "Insta360 .insv files are two unstitched fisheye images. Export the clip from Insta360 Studio as a 360° MP4, then import that.";
	}
	if (/\.360$/i.test(fileName)) {
		return "GoPro MAX .360 files use GoPro's cubemap format. Export the clip from GoPro Player as a 360° MP4 (equirectangular), then import that.";
	}
	return null;
}

export function detectSphere({
	fileName,
	head,
	tail,
	width,
	height,
}: {
	fileName: string;
	head: Uint8Array;
	tail: Uint8Array;
	width?: number;
	height?: number;
}): SphereInfo {
	const unsupported = unsupportedSphereFormat(fileName);
	if (unsupported) return { is360: false, source: null, unsupported };
	if (hasSphericalMetadata(head) || hasSphericalMetadata(tail)) {
		return { is360: true, source: "metadata" };
	}
	if (hasSphereShape({ width, height }))
		return { is360: true, source: "shape" };
	return { is360: false, source: null };
}
