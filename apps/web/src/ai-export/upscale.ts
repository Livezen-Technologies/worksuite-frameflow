import type * as Ort from "onnxruntime-web";
import { createSession, loadOrt, type AiBackend } from "./runtime";
import { chwToRgba, cropRgba, planTiles, rgbaToChw } from "./tensors";

export interface RgbaFrame {
	rgba: Uint8ClampedArray<ArrayBuffer>;
	width: number;
	height: number;
}

const TILE = 128;
const OVERLAP = 8;

/**
 * AI Ultra HD (SRS EX-20): an image super-resolution model (Real-ESRGAN
 * class: one [1,3,H,W] 0–1 input, one [1,3,sH,sW] output) run tile by tile.
 */
export class Upscaler {
	private session: Ort.InferenceSession;
	private ort: typeof Ort;
	readonly backend: AiBackend;
	readonly scale: number;

	private constructor({
		session,
		ort,
		backend,
		scale,
	}: {
		session: Ort.InferenceSession;
		ort: typeof Ort;
		backend: AiBackend;
		scale: number;
	}) {
		this.session = session;
		this.ort = ort;
		this.backend = backend;
		this.scale = scale;
	}

	static async create(bytes: ArrayBuffer): Promise<Upscaler> {
		const ort = await loadOrt();
		const { session, backend } = await createSession(bytes);
		// Learn the model's scale from a tiny probe.
		const probe = new ort.Tensor("float32", new Float32Array(3 * 16 * 16), [1, 3, 16, 16]);
		const out = await session.run({ [session.inputNames[0] ?? "input"]: probe });
		const result = out[session.outputNames[0] ?? "output"];
		const dims = result?.dims ?? [];
		const scale = Math.max(1, Math.round(Number(dims[3] ?? 16) / 16));
		return new Upscaler({ session, ort, backend, scale });
	}

	/** Upscales a frame by the model's scale. */
	async upscale(frame: RgbaFrame): Promise<RgbaFrame> {
		const s = this.scale;
		const outWidth = frame.width * s;
		const outHeight = frame.height * s;
		const out = new Uint8ClampedArray(outWidth * outHeight * 4);
		for (const tile of planTiles({
			width: frame.width,
			height: frame.height,
			tile: TILE,
			overlap: OVERLAP,
		})) {
			const input = cropRgba({
				rgba: frame.rgba,
				width: frame.width,
				x: tile.x,
				y: tile.y,
				cropWidth: tile.width,
				cropHeight: tile.height,
			});
			const tensor = new this.ort.Tensor(
				"float32",
				rgbaToChw({ rgba: input, width: tile.width, height: tile.height }),
				[1, 3, tile.height, tile.width],
			);
			const result = await this.session.run({
				[this.session.inputNames[0] ?? "input"]: tensor,
			});
			const output = result[this.session.outputNames[0] ?? "output"];
			if (!output) throw new Error("The upscaling model returned nothing.");
			const data = await output.getData();
			if (!(data instanceof Float32Array))
				throw new Error("The upscaling model must output float32.");
			const tw = tile.width * s;
			const th = tile.height * s;
			const rgba = chwToRgba({ data, width: tw, height: th });
			// Keep only the tile's own area; the overlap hides seams.
			const ox = (tile.keepX - tile.x) * s;
			const oy = (tile.keepY - tile.y) * s;
			const kw = tile.keepWidth * s;
			const kh = tile.keepHeight * s;
			for (let row = 0; row < kh; row++) {
				const from = ((oy + row) * tw + ox) * 4;
				const to = ((tile.keepY * s + row) * outWidth + tile.keepX * s) * 4;
				out.set(rgba.subarray(from, from + kw * 4), to);
			}
			tensor.dispose();
			output.dispose();
		}
		return { rgba: out, width: outWidth, height: outHeight };
	}

	/** Milliseconds for one full tile, to estimate export time (EX-22). */
	async benchmark(): Promise<number> {
		const frame = {
			rgba: new Uint8ClampedArray(TILE * TILE * 4).fill(128),
			width: TILE,
			height: TILE,
		};
		await this.upscale(frame);
		const start = performance.now();
		await this.upscale(frame);
		return performance.now() - start;
	}

	tilesFor({ width, height }: { width: number; height: number }): number {
		return Math.ceil(width / TILE) * Math.ceil(height / TILE);
	}

	release() {
		void this.session.release();
	}
}
