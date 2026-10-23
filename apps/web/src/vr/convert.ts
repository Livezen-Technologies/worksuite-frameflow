"use client";

import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { helperBridge, type SphereLayout } from "@/proxy/bridge";

const CHUNK = 8 * 1024 * 1024;
const SCAN = 4 * 1024 * 1024;

export interface SpherePlan {
	layout: SphereLayout;
	/** Height of the equirectangular result (width is twice this). */
	height: number;
	videoTracks: number;
	duration: number;
}

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

function contains({ bytes, text }: { bytes: Uint8Array; text: string }) {
	const p = ascii(text);
	outer: for (let i = 0; i + p.length <= bytes.length; i++) {
		for (let j = 0; j < p.length; j++) if (bytes[i + j] !== p[j]) continue outer;
		return true;
	}
	return false;
}

/** A cubemap 360° video (YouTube's EAC, tagged sv3d/cbmp). */
async function isCubemap(file: File): Promise<boolean> {
	for (const part of [file.slice(0, SCAN), file.slice(Math.max(0, file.size - SCAN))]) {
		const bytes = new Uint8Array(await part.arrayBuffer());
		if (contains({ bytes, text: "sv3d" }) && contains({ bytes, text: "cbmp" })) return true;
	}
	return false;
}

/**
 * Which 360° camera format a file is, and how to turn it into
 * equirectangular video (VR-02, VR-03); null for anything else.
 */
export async function spherePlanFor(file: File): Promise<SpherePlan | null> {
	const insv = /\.insv$/i.test(file.name);
	const gopro = /\.360$/i.test(file.name);
	if (!insv && !gopro && (!file.type.startsWith("video/") || !(await isCubemap(file))))
		return null;
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const tracks = await input.getVideoTracks();
		const first = tracks[0];
		if (!first) return null;
		const duration = await input.computeDuration();
		const w = first.displayWidth;
		const h = first.displayHeight;
		if (insv) {
			// Side by side: each lens is h tall; one lens per track: h tall too.
			return { layout: "dfisheye", height: h, videoTracks: tracks.length, duration };
		}
		if (gopro) return { layout: "gopro", height: 2 * h, videoTracks: tracks.length, duration };
		// A 3×2 cubemap's faces are w/3 wide; the sphere is 2 faces tall.
		return { layout: "eac", height: Math.round((2 * w) / 3), videoTracks: 1, duration };
	} catch {
		return null;
	} finally {
		input.dispose();
	}
}

/** Runs the desktop helper's FFmpeg conversion; null without the desktop app. */
export async function convertSphereFile({
	file,
	plan,
	onProgress,
}: {
	file: File;
	plan: SpherePlan;
	onProgress?: (progress: number) => void;
}): Promise<File | null> {
	const bridge = helperBridge();
	if (!bridge?.sphere) return null;
	const { jobId } = await bridge.begin();
	const off = bridge.onProgress((p) => {
		if (p.jobId === jobId) onProgress?.(p.progress);
	});
	try {
		for (let offset = 0; offset < file.size; offset += CHUNK)
			await bridge.write({ jobId, chunk: await file.slice(offset, offset + CHUNK).arrayBuffer() });
		const { size } = await bridge.sphere({ jobId, ...plan });
		const parts: ArrayBuffer[] = [];
		for (let offset = 0; offset < size; offset += CHUNK)
			parts.push(await bridge.read({ jobId, offset, length: CHUNK }));
		const name = `${file.name.replace(/\.[^.]+$/, "")}.mp4`;
		return new File(parts, name, { type: "video/mp4" });
	} finally {
		off();
		await bridge.release({ jobId });
	}
}
