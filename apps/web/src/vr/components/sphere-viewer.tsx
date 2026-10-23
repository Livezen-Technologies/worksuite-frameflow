"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { addFrameTap } from "@/services/renderer/frame-taps";

const VERTEX = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
	v_uv = a_pos * 0.5 + 0.5;
	gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 color;
uniform sampler2D u_frame;
uniform vec3 u_view; // yaw, pitch, fov (radians)
uniform float u_aspect;
const float PI = 3.14159265358979;
void main() {
	vec2 p = vec2((v_uv.x * 2.0 - 1.0) * u_aspect, v_uv.y * 2.0 - 1.0);
	float t = tan(u_view.z * 0.5);
	vec3 d = normalize(vec3(p.x * t, p.y * t, 1.0));
	float cp = cos(u_view.y), sp = sin(u_view.y);
	d = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);
	float cy = cos(u_view.x), sy = sin(u_view.x);
	d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
	float lon = atan(d.x, d.z);
	float lat = asin(clamp(d.y, -1.0, 1.0));
	// Rows are uploaded bottom-up (UNPACK_FLIP_Y), so up is +v.
	color = texture(u_frame, vec2(fract(lon / (2.0 * PI) + 0.5), 0.5 + lat / PI));
}`;

function compile({
	gl,
	type,
	source,
}: {
	gl: WebGL2RenderingContext;
	type: number;
	source: string;
}) {
	const shader = gl.createShader(type);
	if (!shader) throw new Error("WebGL shader");
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		throw new Error(gl.getShaderInfoLog(shader) ?? "WebGL shader");
	}
	return shader;
}

/**
 * Look-around view of a 360° project (SRS VR-06): the composited
 * equirectangular frame is shown through a headset-like camera. Drag to
 * look, scroll to change the field of view.
 */
export function SphereViewer() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const view = useRef({ yaw: 0, pitch: 0, fov: 90 });
	const drag = useRef<{
		x: number;
		y: number;
		yaw: number;
		pitch: number;
	} | null>(null);
	const draw = useRef<() => void>(() => {});
	const [label, setLabel] = useState("0° · 0°");

	useEffect(() => {
		const canvas = canvasRef.current;
		const gl = canvas?.getContext("webgl2", { premultipliedAlpha: false });
		if (!canvas || !gl) return;
		const program = gl.createProgram();
		gl.attachShader(
			program,
			compile({ gl, type: gl.VERTEX_SHADER, source: VERTEX }),
		);
		gl.attachShader(
			program,
			compile({ gl, type: gl.FRAGMENT_SHADER, source: FRAGMENT }),
		);
		gl.linkProgram(program);
		gl.useProgram(program);
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
			gl.STATIC_DRAW,
		);
		const loc = gl.getAttribLocation(program, "a_pos");
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		const uView = gl.getUniformLocation(program, "u_view");
		const uAspect = gl.getUniformLocation(program, "u_aspect");
		let hasFrame = false;

		draw.current = () => {
			const rect = canvas.getBoundingClientRect();
			const dpr = Math.min(2, window.devicePixelRatio || 1);
			const w = Math.max(1, Math.round(rect.width * dpr));
			const h = Math.max(1, Math.round(rect.height * dpr));
			if (canvas.width !== w || canvas.height !== h) {
				canvas.width = w;
				canvas.height = h;
			}
			gl.viewport(0, 0, w, h);
			if (!hasFrame) {
				gl.clearColor(0, 0, 0, 1);
				gl.clear(gl.COLOR_BUFFER_BIT);
				return;
			}
			const { yaw, pitch, fov } = view.current;
			gl.uniform3f(
				uView,
				(yaw * Math.PI) / 180,
				(pitch * Math.PI) / 180,
				(fov * Math.PI) / 180,
			);
			gl.uniform1f(uAspect, w / h);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
		};

		const off = addFrameTap((source) => {
			if (source.width === 0) return;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				source,
			);
			hasFrame = true;
			draw.current();
		});
		const resize = new ResizeObserver(() => draw.current());
		resize.observe(canvas);
		draw.current();
		return () => {
			off();
			resize.disconnect();
			gl.getExtension("WEBGL_lose_context")?.loseContext();
		};
	}, []);

	const update = (patch: Partial<typeof view.current>) => {
		view.current = { ...view.current, ...patch };
		setLabel(
			`${Math.round(view.current.yaw)}° · ${Math.round(view.current.pitch)}°`,
		);
		draw.current();
	};

	return (
		<div className="absolute inset-0" data-sphere-viewer>
			<canvas
				ref={canvasRef}
				className="size-full cursor-grab active:cursor-grabbing"
				onPointerDown={(e) => {
					drag.current = {
						x: e.clientX,
						y: e.clientY,
						yaw: view.current.yaw,
						pitch: view.current.pitch,
					};
					e.currentTarget.setPointerCapture(e.pointerId);
				}}
				onPointerMove={(e) => {
					const d = drag.current;
					if (!d) return;
					const perPixel =
						view.current.fov / Math.max(1, e.currentTarget.clientHeight);
					update({
						yaw: d.yaw - (e.clientX - d.x) * perPixel,
						pitch: Math.max(
							-89,
							Math.min(89, d.pitch + (e.clientY - d.y) * perPixel),
						),
					});
				}}
				onPointerUp={() => {
					drag.current = null;
				}}
				onWheel={(e) =>
					update({
						fov: Math.max(
							30,
							Math.min(120, view.current.fov * Math.exp(e.deltaY * 0.001)),
						),
					})
				}
			/>
			<div className="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">
				360° view · {label}
			</div>
			<button
				type="button"
				className="absolute top-2 right-2 rounded bg-black/60 p-1 text-white hover:bg-black/80"
				aria-label="Reset view"
				title="Reset view"
				onClick={() => update({ yaw: 0, pitch: 0, fov: 90 })}
			>
				<RotateCcw className="size-3.5" />
			</button>
		</div>
	);
}

/** Horizon, front marker and first-look area on the flat 360° frame (VR-07). */
export function SphereGuides() {
	return (
		<svg
			className="pointer-events-none absolute inset-0 size-full"
			viewBox="0 0 360 180"
			preserveAspectRatio="none"
			data-sphere-guides
		>
			<rect
				x={150}
				y={65}
				width={60}
				height={50}
				fill="none"
				stroke="#22D3EE"
				strokeOpacity={0.7}
				strokeDasharray="3 2"
				vectorEffect="non-scaling-stroke"
			/>
			<line
				x1={0}
				y1={90}
				x2={360}
				y2={90}
				stroke="#FACC15"
				strokeOpacity={0.6}
				vectorEffect="non-scaling-stroke"
			/>
			<line
				x1={180}
				y1={84}
				x2={180}
				y2={96}
				stroke="#22D3EE"
				strokeWidth={2}
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}
