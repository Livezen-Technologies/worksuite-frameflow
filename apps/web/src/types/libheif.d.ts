declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
	export interface HeifImage {
		get_width(): number;
		get_height(): number;
		display(
			target: ImageData,
			callback: (result: ImageData | null) => void,
		): void;
		free?(): void;
	}
	export interface LibHeif {
		ready: Promise<unknown>;
		HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] };
	}
	export default function factory(options?: Record<string, unknown>): LibHeif;
}
