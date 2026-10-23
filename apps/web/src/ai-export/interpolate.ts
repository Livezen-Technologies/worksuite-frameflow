import type * as Ort from "onnxruntime-web";
import { createSession, loadOrt, type AiBackend } from "./runtime";
import { chwToRgba, cropRgba, padRgba, rgbaToChw } from "./tensors";
import type { RgbaFrame } from "./upscale";

/**
 * Optical flow (SRS EX-21): a frame-interpolation model (RIFE class) makes
 * the frame halfway between two. Inputs are two [1,3,H,W] frames and, if
 * the model has a third input, the timestep (0.5); sizes are padded to 32.
 */
export class Interpolator {
	private session: Ort.InferenceSession;
	private ort: typeof Ort;
	readonly backend: AiBackend;

	private constructor({
		session,
		ort,
		backend,
	}: {
		session: Ort.InferenceSession;
		ort: typeof Ort;
		backend: AiBackend;
	}) {
		this.session = session;
		this.ort = ort;
		this.backend = backend;
	}

	static async create(bytes: ArrayBuffer): Promise<Interpolator> {
		const ort = await loadOrt();
		const { session, backend } = await createSession(bytes);
		if (session.inputNames.length < 2)
			throw new Error("This model doesn't look like a frame-interpolation model.");
		return new Interpolator({ session, ort, backend });
	}

	async middle({ a, b }: { a: RgbaFrame; b: RgbaFrame }): Promise<RgbaFrame> {
		const pa = padRgba({ rgba: a.rgba, width: a.width, height: a.height, multiple: 32 });
		const pb = padRgba({ rgba: b.rgba, width: b.width, height: b.height, multiple: 32 });
		const dims = [1, 3, pa.height, pa.width];
		const [n0, n1, n2] = this.session.inputNames;
		const feeds: Record<string, Ort.Tensor> = {
			[n0 ?? "img0"]: new this.ort.Tensor("float32", rgbaToChw(pa), dims),
			[n1 ?? "img1"]: new this.ort.Tensor("float32", rgbaToChw(pb), dims),
		};
		if (n2)
			feeds[n2] = new this.ort.Tensor(
				"float32",
				new Float32Array(pa.width * pa.height).fill(0.5),
				[1, 1, pa.height, pa.width],
			);
		const result = await this.session.run(feeds);
		const output = result[this.session.outputNames[0] ?? "output"];
		if (!output) throw new Error("The interpolation model returned nothing.");
		const data = await output.getData();
		if (!(data instanceof Float32Array))
			throw new Error("The interpolation model must output float32.");
		const rgba = chwToRgba({ data, width: pa.width, height: pa.height });
		for (const tensor of Object.values(feeds)) tensor.dispose();
		output.dispose();
		return {
			rgba: cropRgba({ rgba, width: pa.width, x: 0, y: 0, cropWidth: a.width, cropHeight: a.height }),
			width: a.width,
			height: a.height,
		};
	}

	/** Milliseconds for one in-between frame at this size (EX-22). */
	async benchmark({ width, height }: { width: number; height: number }): Promise<number> {
		const frame = { rgba: new Uint8ClampedArray(width * height * 4).fill(128), width, height };
		await this.middle({ a: frame, b: frame });
		const start = performance.now();
		await this.middle({ a: frame, b: frame });
		return performance.now() - start;
	}

	release() {
		void this.session.release();
	}
}
