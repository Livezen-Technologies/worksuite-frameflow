/**
 * Hardware check before AI export (SRS EX-23): too little memory or no GPU
 * at a large size shows why and suggests a lower resolution instead of
 * risking a crash.
 */
export interface HardwareVerdict {
	ok: boolean;
	reason?: string;
	/** A short side (e.g. 1080) that should work, when `ok` is false. */
	suggestedLevel?: number;
	/** True when it will run, but on the CPU (much slower). */
	slow?: boolean;
}

export function judgeHardware({
	kind,
	width,
	height,
	hasGpu,
	maxBufferBytes,
	deviceMemoryGb,
}: {
	kind: "upscale" | "interpolate";
	width: number;
	height: number;
	hasGpu: boolean;
	maxBufferBytes: number | null;
	deviceMemoryGb: number | null;
}): HardwareVerdict {
	const shortSide = Math.min(width, height);
	// Interpolation works on whole frames: two inputs, flow and output.
	const frameBytes = width * height * 3 * 4;
	const working = kind === "interpolate" ? frameBytes * 12 : 128 * 128 * 3 * 4 * 64;
	const memory = (deviceMemoryGb ?? 8) * 1024 ** 3;
	if (working > memory * 0.25) {
		const level = shortSide > 1080 ? 1080 : 720;
		return {
			ok: false,
			reason: `Not enough memory for this at ${width}×${height}.`,
			suggestedLevel: level,
		};
	}
	if (hasGpu && maxBufferBytes !== null && kind === "interpolate" && frameBytes * 2 > maxBufferBytes) {
		return {
			ok: false,
			reason: "Your graphics card can't hold frames this large.",
			suggestedLevel: shortSide > 1080 ? 1080 : 720,
		};
	}
	if (!hasGpu && shortSide > 1080 && kind === "interpolate")
		return {
			ok: false,
			reason: "Without a supported graphics card this would take hours.",
			suggestedLevel: 1080,
		};
	return { ok: true, slow: !hasGpu };
}

/** Reads what the browser can tell us about the GPU and memory. */
export async function readHardware(): Promise<{
	hasGpu: boolean;
	maxBufferBytes: number | null;
	deviceMemoryGb: number | null;
}> {
	const nav = navigator as Navigator & {
		gpu?: { requestAdapter: () => Promise<{ limits: { maxBufferSize: number } } | null> };
		deviceMemory?: number;
	};
	let maxBufferBytes: number | null = null;
	let hasGpu = false;
	try {
		const adapter = await nav.gpu?.requestAdapter();
		if (adapter) {
			hasGpu = true;
			maxBufferBytes = adapter.limits.maxBufferSize;
		}
	} catch {
		// No WebGPU.
	}
	return { hasGpu, maxBufferBytes, deviceMemoryGb: nav.deviceMemory ?? null };
}
