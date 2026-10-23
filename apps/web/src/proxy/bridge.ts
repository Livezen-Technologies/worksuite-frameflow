/** Desktop app's native media helper (electron/native-helper.js). */
export type HelperGpu =
	| "auto"
	| "cpu"
	| "nvidia"
	| "intel"
	| "amd"
	| "apple"
	| "windows"
	| "vaapi";

export interface HelperCaps {
	available: boolean;
	reason: string | null;
	version?: string;
	gpus: Exclude<HelperGpu, "auto" | "cpu">[];
	cpu?: boolean;
}

export interface NativeHelperBridge {
	caps: () => Promise<HelperCaps>;
	configure: (args: {
		concurrency?: number;
		priority?: "background" | "normal";
	}) => Promise<unknown>;
	begin: () => Promise<{ jobId: string }>;
	write: (args: { jobId: string; chunk: ArrayBuffer }) => Promise<void>;
	proxy: (args: {
		jobId: string;
		height: number;
		gpu: HelperGpu;
		duration?: number;
		hasAudio?: boolean;
	}) => Promise<{ size: number; encoder: string }>;
	read: (args: {
		jobId: string;
		offset: number;
		length: number;
	}) => Promise<ArrayBuffer>;
	release: (args: { jobId: string }) => Promise<void>;
	onProgress: (
		listener: (p: { jobId: string; progress: number }) => void,
	) => () => void;
}

export function helperBridge(): NativeHelperBridge | null {
	if (typeof window === "undefined") return null;
	return window.worksuite?.helper ?? null;
}
