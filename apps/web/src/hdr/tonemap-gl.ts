import type { ToneMapSettings, Transfer } from "./tonemap";

/**
 * GPU version of toneMapPixel: reads the three 10-bit planes of a decoded
 * frame (I420P10 / I422P10 / I444P10) as integer textures, converts
 * BT.2020 Y'CbCr to RGB, applies the transfer, roll-off and gamut mapping
 * and writes sRGB for the editor's 8-bit compositor.
 */

const VERTEX = `#version 300 es
in vec2 position;
out vec2 uv;
void main() {
	uv = position * 0.5 + 0.5;
	uv.y = 1.0 - uv.y;
	gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp usampler2D;
in vec2 uv;
out vec4 color;
uniform usampler2D planeY;
uniform usampler2D planeU;
uniform usampler2D planeV;
uniform ivec2 size;
uniform ivec2 chromaShift;
uniform int transfer; // 0 sdr, 1 hlg, 2 pq
uniform bool fullRange;
uniform float maxCode;
uniform float rolloff;
uniform float saturation;
uniform float exposure;
uniform int outputMode; // 0 SDR (tone-mapped), 1 HLG signal for HDR projects

const vec3 LUMA = vec3(0.2627, 0.678, 0.0593);

float pqToNits(float s) {
	const float m1 = 2610.0 / 16384.0;
	const float m2 = 2523.0 / 4096.0 * 128.0;
	const float c1 = 3424.0 / 4096.0;
	const float c2 = 2413.0 / 4096.0 * 32.0;
	const float c3 = 2392.0 / 4096.0 * 32.0;
	float p = pow(max(s, 0.0), 1.0 / m2);
	return 10000.0 * pow(max(p - c1, 0.0) / (c2 - c3 * p), 1.0 / m1);
}

float hlgToScene(float s) {
	const float a = 0.17883277;
	const float b = 1.0 - 4.0 * a;
	float c = 0.5 - a * log(4.0 * a);
	float e = max(s, 0.0);
	return e <= 0.5 ? e * e / 3.0 : (exp((e - c) / a) + b) / 12.0;
}

float hlgOetf(float e) {
	const float a = 0.17883277;
	const float b = 1.0 - 4.0 * a;
	float c = 0.5 - a * log(4.0 * a);
	e = clamp(e, 0.0, 1.0);
	return e <= 1.0 / 12.0 ? sqrt(3.0 * e) : a * log(12.0 * e - b) + c;
}

float rolloffCurve(float x, float r) {
	float knee = 1.0 - 0.6 * clamp(r, 0.0, 1.0) - 0.15;
	if (x <= knee) return x;
	float span = 1.0 - knee;
	return knee + span * (1.0 - exp(-(x - knee) / span));
}

float srgb(float v) {
	v = clamp(v, 0.0, 1.0);
	return v <= 0.0031308 ? 12.92 * v : 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}

void main() {
	ivec2 p = ivec2(uv * vec2(size));
	p = min(p, size - 1);
	ivec2 c = p >> chromaShift;
	float y = float(texelFetch(planeY, p, 0).r) / maxCode;
	float u = float(texelFetch(planeU, c, 0).r) / maxCode;
	float v = float(texelFetch(planeV, c, 0).r) / maxCode;
	if (fullRange) {
		u -= 0.5;
		v -= 0.5;
	} else {
		y = (y * maxCode - 64.0 * maxCode / 1023.0) / (876.0 * maxCode / 1023.0);
		u = (u * maxCode - 512.0 * maxCode / 1023.0) / (896.0 * maxCode / 1023.0);
		v = (v * maxCode - 512.0 * maxCode / 1023.0) / (896.0 * maxCode / 1023.0);
	}
	vec3 rgb = clamp(vec3(y + 1.4746 * v, y - 0.16455 * u - 0.57135 * v, y + 1.8814 * u), 0.0, 1.0);

	vec3 nits;
	if (transfer == 2) {
		nits = vec3(pqToNits(rgb.r), pqToNits(rgb.g), pqToNits(rgb.b));
	} else if (transfer == 1) {
		vec3 scene = vec3(hlgToScene(rgb.r), hlgToScene(rgb.g), hlgToScene(rgb.b));
		float ys = max(dot(LUMA, scene), 1e-6);
		nits = scene * 1000.0 * pow(ys, 0.2);
	} else {
		nits = pow(rgb, vec3(2.4)) * 203.0;
	}
	if (outputMode == 1) {
		// Keep HDR: to a 1,000-nit HLG display, highlights above it rolled off.
		vec3 d = nits * exp2(exposure) / 1000.0;
		float dl = dot(LUMA, d);
		float dm = rolloffCurve(dl, rolloff);
		d *= dl > 1e-6 ? dm / dl : 0.0;
		float yd = max(dot(LUMA, d), 1e-6);
		vec3 scene = d * pow(yd, 1.0 / 1.2 - 1.0);
		color = vec4(hlgOetf(scene.r), hlgOetf(scene.g), hlgOetf(scene.b), 1.0);
		return;
	}
	vec3 rel = nits * exp2(exposure) / 203.0;
	float lum = dot(LUMA, rel);
	float mapped = rolloffCurve(lum, rolloff);
	float scale = lum > 1e-6 ? mapped / lum : 0.0;
	float highlight = clamp((lum - 1.0) / 3.0, 0.0, 1.0);
	float sat = saturation * (1.0 - 0.35 * highlight);
	vec3 toned = mapped + (rel * scale - mapped) * sat;
	mat3 to709 = mat3(
		1.6605, -0.1246, -0.0182,
		-0.5876, 1.1329, -0.1006,
		-0.0728, -0.0083, 1.1187
	);
	vec3 out709 = to709 * toned;
	color = vec4(srgb(out709.r), srgb(out709.g), srgb(out709.b), 1.0);
}`;

export interface PlanarFrame {
	format: string;
	width: number;
	height: number;
	data: Uint16Array;
	layout: { offset: number; stride: number }[];
	fullRange: boolean;
}

const TRANSFER_CODE: Record<Transfer, number> = { sdr: 0, hlg: 1, pq: 2 };

/** Formats this path reads; anything else falls back to the browser. */
export function isSupportedFormat(format: string | null): boolean {
	return (
		format === "I420P10" ||
		format === "I422P10" ||
		format === "I444P10" ||
		format === "I420P12" ||
		format === "I422P12" ||
		format === "I444P12"
	);
}

function chromaShiftOf(format: string): [number, number] {
	if (format.startsWith("I420")) return [1, 1];
	if (format.startsWith("I422")) return [1, 0];
	return [0, 0];
}

export class ToneMapper {
	readonly canvas: HTMLCanvasElement;
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;
	private textures: WebGLTexture[];
	private deep: { fbo: WebGLFramebuffer; texture: WebGLTexture; width: number; height: number } | null = null;

	constructor() {
		this.canvas = document.createElement("canvas");
		const gl = this.canvas.getContext("webgl2", {
			premultipliedAlpha: false,
			preserveDrawingBuffer: true,
		});
		if (!gl) throw new Error("WebGL2 is not available for HDR tone mapping");
		this.gl = gl;
		const compile = ({ type, source }: { type: number; source: string }) => {
			const shader = gl.createShader(type);
			if (!shader) throw new Error("Could not create a shader");
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
				throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed");
			return shader;
		};
		const program = gl.createProgram();
		if (!program) throw new Error("Could not create a program");
		gl.attachShader(
			program,
			compile({ type: gl.VERTEX_SHADER, source: VERTEX }),
		);
		gl.attachShader(
			program,
			compile({ type: gl.FRAGMENT_SHADER, source: FRAGMENT }),
		);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw new Error(gl.getProgramInfoLog(program) ?? "Program link failed");
		this.program = program;
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
			gl.STATIC_DRAW,
		);
		const position = gl.getAttribLocation(program, "position");
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		this.textures = [0, 1, 2].map(() => {
			const texture = gl.createTexture();
			if (!texture) throw new Error("Could not create a texture");
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			return texture;
		});
	}

	render({
		frame,
		transfer,
		settings,
		output = "sdr",
	}: {
		frame: PlanarFrame;
		transfer: Transfer;
		settings: ToneMapSettings;
		output?: "sdr" | "hlg";
	}): HTMLCanvasElement {
		const { gl, program } = this;
		const { width, height } = frame;
		if (this.canvas.width !== width || this.canvas.height !== height) {
			this.canvas.width = width;
			this.canvas.height = height;
		}
		const [sx, sy] = chromaShiftOf(frame.format);
		const planeSizes = [
			[width, height],
			[(width + sx) >> sx, (height + sy) >> sy],
			[(width + sx) >> sx, (height + sy) >> sy],
		];
		gl.useProgram(program);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
		for (let i = 0; i < 3; i++) {
			const { offset, stride } = frame.layout[i];
			const [w, h] = planeSizes[i];
			gl.activeTexture(gl.TEXTURE0 + i);
			gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
			gl.pixelStorei(gl.UNPACK_ROW_LENGTH, stride / 2);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.R16UI,
				w,
				h,
				0,
				gl.RED_INTEGER,
				gl.UNSIGNED_SHORT,
				new Uint16Array(
					frame.data.buffer,
					frame.data.byteOffset + offset,
					(stride / 2) * h,
				),
			);
		}
		gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
		const set = (name: string) => gl.getUniformLocation(program, name);
		gl.uniform1i(set("planeY"), 0);
		gl.uniform1i(set("planeU"), 1);
		gl.uniform1i(set("planeV"), 2);
		gl.uniform2i(set("size"), width, height);
		gl.uniform2i(set("chromaShift"), sx, sy);
		gl.uniform1i(set("transfer"), TRANSFER_CODE[transfer]);
		gl.uniform1i(set("fullRange"), frame.fullRange ? 1 : 0);
		gl.uniform1f(set("maxCode"), frame.format.endsWith("P12") ? 4095 : 1023);
		gl.uniform1f(set("rolloff"), settings.rolloff);
		gl.uniform1f(set("saturation"), settings.saturation);
		gl.uniform1f(set("exposure"), settings.exposure);
		gl.uniform1i(set("outputMode"), output === "hlg" ? 1 : 0);
		gl.viewport(0, 0, width, height);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		return this.canvas;
	}

	/**
	 * The same picture at full precision (HD-14): drawn into a half-float
	 * target and read back as half-float RGBA bits, top row first. Null when
	 * the GPU can't render to float.
	 */
	renderDeep(args: Parameters<ToneMapper["render"]>[0]): Uint16Array | null {
		const { gl } = this;
		if (!gl.getExtension("EXT_color_buffer_float")) return null;
		const { width, height } = args.frame;
		if (!this.deep || this.deep.width !== width || this.deep.height !== height) {
			if (this.deep) {
				gl.deleteFramebuffer(this.deep.fbo);
				gl.deleteTexture(this.deep.texture);
			}
			const texture = gl.createTexture();
			const fbo = gl.createFramebuffer();
			if (!texture || !fbo) return null;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
			if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				return null;
			}
			this.deep = { fbo, texture, width, height };
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.deep.fbo);
		this.render(args);
		const flipped = new Uint16Array(width * height * 4);
		gl.readPixels(0, 0, width, height, gl.RGBA, gl.HALF_FLOAT, flipped);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		// GL rows start at the bottom.
		const out = new Uint16Array(flipped.length);
		const row = width * 4;
		for (let y = 0; y < height; y++)
			out.set(flipped.subarray((height - 1 - y) * row, (height - y) * row), y * row);
		return out;
	}
}
