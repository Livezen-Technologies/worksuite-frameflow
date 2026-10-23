import type { ExportPreset } from "@/export/presets";
import { injectSphericalMetadata } from "./inject";

/** Export presets for a 360° project (SRS VR-20). */
export const SPHERE_EXPORT_PRESETS: ExportPreset[] = [
	{
		id: "youtube-360-5k",
		label: "YouTube 360 5.7K",
		width: 5760,
		height: 2880,
	},
	{ id: "youtube-360-4k", label: "YouTube 360 4K", width: 3840, height: 1920 },
	{ id: "facebook-360", label: "Facebook 360", width: 4096, height: 2048 },
	{ id: "vr-headset", label: "VR headset", width: 5120, height: 2560 },
];

/** Adds 360° metadata to a 2:1 MP4 export; other exports pass through. */
export function finishSphereExport({
	buffer,
	format,
	width,
	height,
}: {
	buffer: ArrayBuffer;
	format: "mp4" | "webm";
	width: number;
	height: number;
}): ArrayBuffer {
	if (format !== "mp4" || Math.abs(width / height - 2) > 0.01) return buffer;
	const out = injectSphericalMetadata(new Uint8Array(buffer));
	const copy = new ArrayBuffer(out.byteLength);
	new Uint8Array(copy).set(out);
	return copy;
}
