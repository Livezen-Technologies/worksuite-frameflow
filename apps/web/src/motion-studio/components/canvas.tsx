"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	editProp,
	layerBounds,
	layerSize,
	newId,
	snapBox,
	valueAt,
	type Box,
	type Guide,
	type Layer,
	type PathPoint,
} from "../model";
import { useStudio } from "../store";
import { layerTransform, StageContent } from "./stage";

export type Tool = "select" | "pen";

const RULER = 20;
const SNAP_PX = 6;

interface View {
	zoom: number;
	panX: number;
	panY: number;
}

type Drag =
	| { kind: "move"; start: { x: number; y: number }; origin: Array<{ id: string; x: number; y: number }>; box: Box }
	| { kind: "scale"; id: string; anchor: { x: number; y: number }; startDist: number; s0: number }
	| { kind: "rotate"; id: string; anchor: { x: number; y: number }; startAngle: number; r0: number }
	| { kind: "pan"; startX: number; startY: number; panX: number; panY: number }
	| { kind: "point"; id: string; index: number; part: "point" | "in" | "out"; makeHandles: boolean; start: { x: number; y: number } }
	| { kind: "pen"; id: string; index: number };

function union(boxes: Box[]): Box {
	return {
		left: Math.min(...boxes.map((b) => b.left)),
		top: Math.min(...boxes.map((b) => b.top)),
		right: Math.max(...boxes.map((b) => b.right)),
		bottom: Math.max(...boxes.map((b) => b.bottom)),
	};
}

/** Converts a canvas point into a layer's own (pre-transform) coordinates. */
function toLocal({ layer, t, x, y }: { layer: Layer; t: number; x: number; y: number }) {
	const { w, h } = layerSize(layer);
	const s = valueAt({ layer, prop: "scale", t }) || 1;
	const a = (-valueAt({ layer, prop: "rotation", t }) * Math.PI) / 180;
	const dx = x - valueAt({ layer, prop: "x", t });
	const dy = y - valueAt({ layer, prop: "y", t });
	return {
		x: (dx * Math.cos(a) - dy * Math.sin(a)) / s + layer.anchorX * w,
		y: (dx * Math.sin(a) + dy * Math.cos(a)) / s + layer.anchorY * h,
	};
}

function Ruler({ axis, view, size, length }: { axis: "x" | "y"; view: View; size: number; length: number }) {
	const pan = axis === "x" ? view.panX : view.panY;
	const steps = [10, 25, 50, 100, 250, 500, 1000, 2500];
	const step = steps.find((s) => s * view.zoom >= 60) ?? 5000;
	const first = Math.floor(-pan / view.zoom / step) * step;
	const ticks: number[] = [];
	for (let v = first; (v - first) * view.zoom < length + step * view.zoom; v += step) ticks.push(v);
	const horizontal = axis === "x";
	return (
		<svg
			className="bg-muted/60 text-muted-foreground absolute select-none"
			style={horizontal ? { left: RULER, top: 0, width: length, height: RULER } : { left: 0, top: RULER, width: RULER, height: length }}
			aria-hidden
		>
			{ticks.map((v) => {
				const p = pan + v * view.zoom - RULER;
				const inside = v >= 0 && v <= size;
				return horizontal ? (
					<g key={v} opacity={inside ? 1 : 0.4}>
						<line x1={p} x2={p} y1={RULER - 8} y2={RULER} stroke="currentColor" />
						<text x={p + 3} y={10} fontSize={9} fill="currentColor">
							{v}
						</text>
					</g>
				) : (
					<g key={v} opacity={inside ? 1 : 0.4}>
						<line y1={p} y2={p} x1={RULER - 8} x2={RULER} stroke="currentColor" />
						<text x={2} y={p + 10} fontSize={9} fill="currentColor">
							{v}
						</text>
					</g>
				);
			})}
		</svg>
	);
}

/** The editable canvas: selection, move with snapping, scale and rotate handles, pen and point editing. */
export function MotionCanvas({ tool, setTool }: { tool: Tool; setTool: (tool: Tool) => void }) {
	const project = useStudio((s) => s.project);
	const time = useStudio((s) => s.time);
	const selection = useStudio((s) => s.selection);
	const editingPath = useStudio((s) => s.editingPath);
	const wrapRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const [view, setView] = useState<View>({ zoom: 0.4, panX: 40, panY: 40 });
	const [size, setSize] = useState({ w: 800, h: 600 });
	const [guides, setGuides] = useState<Guide[]>([]);
	const drag = useRef<Drag | null>(null);
	const spaceDown = useRef(false);
	const fitted = useRef<string | null>(null);

	const fit = useCallback(() => {
		const wrap = wrapRef.current;
		const p = useStudio.getState().project;
		if (!wrap || !p) return;
		const w = wrap.clientWidth - RULER;
		const h = wrap.clientHeight - RULER;
		const zoom = Math.min((w - 60) / p.width, (h - 60) / p.height);
		setView({ zoom, panX: RULER + (w - p.width * zoom) / 2, panY: RULER + (h - p.height * zoom) / 2 });
	}, []);

	useLayoutEffect(() => {
		const wrap = wrapRef.current;
		if (!wrap) return;
		const observer = new ResizeObserver(() => setSize({ w: wrap.clientWidth, h: wrap.clientHeight }));
		observer.observe(wrap);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (project && fitted.current !== `${project.id}:${project.width}x${project.height}`) {
			fitted.current = `${project.id}:${project.width}x${project.height}`;
			fit();
		}
	}, [project, fit, size]);

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) spaceDown.current = true;
			if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				fit();
			}
		};
		const up = (e: KeyboardEvent) => {
			if (e.code === "Space") spaceDown.current = false;
		};
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
		};
	}, [fit]);

	useEffect(() => {
		const wrap = wrapRef.current;
		if (!wrap) return;
		const wheel = (e: WheelEvent) => {
			e.preventDefault();
			const rect = wrap.getBoundingClientRect();
			if (e.ctrlKey || e.metaKey) {
				const mx = e.clientX - rect.left;
				const my = e.clientY - rect.top;
				setView((v) => {
					const zoom = Math.min(16, Math.max(0.05, v.zoom * Math.exp(-e.deltaY * 0.002)));
					return { zoom, panX: mx - ((mx - v.panX) * zoom) / v.zoom, panY: my - ((my - v.panY) * zoom) / v.zoom };
				});
			} else {
				setView((v) => ({ ...v, panX: v.panX - (e.shiftKey ? e.deltaY : e.deltaX), panY: v.panY - (e.shiftKey ? 0 : e.deltaY) }));
			}
		};
		wrap.addEventListener("wheel", wheel, { passive: false });
		return () => wrap.removeEventListener("wheel", wheel);
	}, []);

	if (!project) return null;

	const toCanvas = (e: { clientX: number; clientY: number }) => {
		const rect = wrapRef.current?.getBoundingClientRect();
		return {
			x: (e.clientX - (rect?.left ?? 0) - view.panX) / view.zoom,
			y: (e.clientY - (rect?.top ?? 0) - view.panY) / view.zoom,
		};
	};

	const studio = useStudio.getState;

	const onPointerDown = (e: React.PointerEvent) => {
		if (e.button === 1 || spaceDown.current) {
			drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY };
			e.currentTarget.setPointerCapture(e.pointerId);
			return;
		}
		if (e.button !== 0) return;
		const p = toCanvas(e);
		const target = e.target instanceof Element ? e.target : null;
		if (!target) return;
		e.currentTarget.setPointerCapture(e.pointerId);

		if (tool === "pen") {
			const s = studio();
			const current = s.editingPath ? s.project?.layers.find((l) => l.id === s.editingPath) : null;
			if (current?.kind === "path" && !current.closed) {
				const local = toLocal({ layer: current, t: s.time, x: p.x, y: p.y });
				const first = current.points[0];
				const closeDist = 10 / view.zoom;
				if (current.points.length > 2 && Math.hypot(local.x - first.x, local.y - first.y) < closeDist) {
					s.updateLayer({ id: current.id, update: (l) => (l.kind === "path" ? { ...l, closed: true } : l) });
					s.setEditingPath(null);
					setTool("select");
					return;
				}
				s.updateLayer({ id: current.id, update: (l) => (l.kind === "path" ? { ...l, points: [...l.points, { x: local.x, y: local.y }] } : l) });
				drag.current = { kind: "pen", id: current.id, index: current.points.length };
				return;
			}
			const layer: Layer = {
				id: newId(),
				name: "Path",
				visible: true,
				locked: false,
				x: 0,
				y: 0,
				scale: 1,
				rotation: 0,
				opacity: 1,
				anchorX: 0,
				anchorY: 0,
				keyframes: {},
				kind: "path",
				points: [{ x: p.x, y: p.y }],
				closed: false,
				fill: "#F43F5E",
				stroke: null,
				strokeWidth: 6,
			};
			s.commit((proj) => ({ ...proj, layers: [...proj.layers, layer] }));
			s.select([layer.id]);
			s.setEditingPath(layer.id);
			drag.current = { kind: "pen", id: layer.id, index: 0 };
			return;
		}

		const handle = target.closest("[data-handle]")?.getAttribute("data-handle");
		const s = studio();
		const selected = s.project?.layers.find((l) => l.id === s.selection[0]);
		if (handle?.startsWith("pt:") && s.editingPath) {
			const [, index, rawPart] = handle.split(":");
			const part = rawPart === "in" || rawPart === "out" ? rawPart : "point";
			s.checkpoint();
			drag.current = {
				kind: "point",
				id: s.editingPath,
				index: Number(index),
				part,
				makeHandles: e.altKey,
				start: p,
			};
			return;
		}
		if (selected && (handle === "scale" || handle === "rotate")) {
			const anchor = { x: valueAt({ layer: selected, prop: "x", t: s.time }), y: valueAt({ layer: selected, prop: "y", t: s.time }) };
			s.checkpoint();
			drag.current =
				handle === "scale"
					? { kind: "scale", id: selected.id, anchor, startDist: Math.max(1, Math.hypot(p.x - anchor.x, p.y - anchor.y)), s0: valueAt({ layer: selected, prop: "scale", t: s.time }) }
					: { kind: "rotate", id: selected.id, anchor, startAngle: Math.atan2(p.y - anchor.y, p.x - anchor.x), r0: valueAt({ layer: selected, prop: "rotation", t: s.time }) };
			return;
		}
		const id = target.closest("[data-motion-layer]")?.getAttribute("data-motion-layer");
		const layer = id ? s.project?.layers.find((l) => l.id === id) : null;
		if (!layer || layer.locked) {
			if (!e.shiftKey) s.select([]);
			s.setEditingPath(null);
			return;
		}
		let ids = s.selection;
		if (e.shiftKey) ids = ids.includes(layer.id) ? ids.filter((x) => x !== layer.id) : [...ids, layer.id];
		else if (!ids.includes(layer.id)) ids = [layer.id];
		s.select(ids);
		if (s.editingPath !== layer.id) s.setEditingPath(null);
		const moving = s.project?.layers.filter((l) => ids.includes(l.id) && !l.locked) ?? [];
		if (!moving.length) return;
		s.checkpoint();
		drag.current = {
			kind: "move",
			start: p,
			origin: moving.map((l) => ({ id: l.id, x: valueAt({ layer: l, prop: "x", t: s.time }), y: valueAt({ layer: l, prop: "y", t: s.time }) })),
			box: union(moving.map((l) => layerBounds({ layer: l, t: s.time }))),
		};
	};

	const onPointerMove = (e: React.PointerEvent) => {
		const d = drag.current;
		if (!d) return;
		const s = studio();
		if (d.kind === "pan") {
			setView((v) => ({ ...v, panX: d.panX + e.clientX - d.startX, panY: d.panY + e.clientY - d.startY }));
			return;
		}
		const p = toCanvas(e);
		if (d.kind === "move") {
			let dx = p.x - d.start.x;
			let dy = p.y - d.start.y;
			if (e.shiftKey && Math.abs(dx) > Math.abs(dy)) dy = 0;
			else if (e.shiftKey) dx = 0;
			const proj = s.project;
			if (!proj) return;
			if (!e.altKey) {
				const ids = new Set(d.origin.map((o) => o.id));
				const targets = [
					{ left: 0, top: 0, right: proj.width, bottom: proj.height },
					...proj.layers.filter((l) => l.visible && !ids.has(l.id)).map((l) => layerBounds({ layer: l, t: s.time })),
				];
				const snap = snapBox({
					box: { left: d.box.left + dx, right: d.box.right + dx, top: d.box.top + dy, bottom: d.box.bottom + dy },
					targets,
					threshold: SNAP_PX / view.zoom,
				});
				dx += snap.dx;
				dy += snap.dy;
				setGuides(snap.guides);
			} else setGuides([]);
			s.preview((pr) => ({
				...pr,
				layers: pr.layers.map((l) => {
					const o = d.origin.find((x) => x.id === l.id);
					if (!o) return l;
					return editProp({ layer: editProp({ layer: l, prop: "x", t: s.time, v: o.x + dx }), prop: "y", t: s.time, v: o.y + dy });
				}),
			}));
			return;
		}
		if (d.kind === "scale") {
			const v = Math.max(0.01, (d.s0 * Math.hypot(p.x - d.anchor.x, p.y - d.anchor.y)) / d.startDist);
			s.updateLayer({ id: d.id, update: (l) => editProp({ layer: l, prop: "scale", t: s.time, v: Math.round(v * 1000) / 1000 }), preview: true });
			return;
		}
		if (d.kind === "rotate") {
			let v = d.r0 + ((Math.atan2(p.y - d.anchor.y, p.x - d.anchor.x) - d.startAngle) * 180) / Math.PI;
			v = e.shiftKey ? Math.round(v / 15) * 15 : Math.round(v * 10) / 10;
			s.updateLayer({ id: d.id, update: (l) => editProp({ layer: l, prop: "rotation", t: s.time, v }), preview: true });
			return;
		}
		if (d.kind === "point" || d.kind === "pen") {
			const layer = s.project?.layers.find((l) => l.id === d.id);
			if (layer?.kind !== "path") return;
			const local = toLocal({ layer, t: s.time, x: p.x, y: p.y });
			const points = layer.points.map((pt, i): PathPoint => {
				if (i !== d.index) return pt;
				if (d.kind === "pen" || (d.kind === "point" && d.makeHandles)) {
					const hx = local.x - pt.x;
					const hy = local.y - pt.y;
					return { ...pt, out: { x: hx, y: hy }, in: { x: -hx, y: -hy } };
				}
				if (d.part === "point") return { ...pt, x: local.x, y: local.y };
				const rel = { x: local.x - pt.x, y: local.y - pt.y };
				const other = d.part === "in" ? "out" : "in";
				// Keep the curve smooth: the opposite handle mirrors the angle (Alt breaks it).
				const mirrored = pt[other] && !e.altKey ? { x: -rel.x, y: -rel.y } : pt[other];
				return { ...pt, [d.part]: rel, [other]: mirrored };
			});
			s.updateLayer({ id: d.id, update: (l) => (l.kind === "path" ? { ...l, points } : l), preview: true });
		}
	};

	const onPointerUp = () => {
		drag.current = null;
		setGuides([]);
	};

	const single = selection.length === 1 ? project.layers.find((l) => l.id === selection[0]) : null;
	const pathLayer = editingPath ? project.layers.find((l) => l.id === editingPath) : null;
	const handle = 9 / view.zoom;

	return (
		<div
			ref={wrapRef}
			className="relative h-full w-full touch-none overflow-hidden bg-[repeating-conic-gradient(#1a1d24_0%_25%,#14171d_0%_50%)] bg-[length:20px_20px]"
			style={{ cursor: tool === "pen" ? "crosshair" : undefined }}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onDoubleClick={(e) => {
				const id = e.target instanceof Element ? e.target.closest("[data-motion-layer]")?.getAttribute("data-motion-layer") : null;
				const layer = project.layers.find((l) => l.id === id);
				if (layer?.kind === "path" && !layer.locked) useStudio.getState().setEditingPath(layer.id);
			}}
			data-motion-canvas
		>
			<svg
				ref={svgRef}
				className="absolute overflow-visible"
				style={{ left: view.panX, top: view.panY, width: project.width * view.zoom, height: project.height * view.zoom }}
				viewBox={`0 0 ${project.width} ${project.height}`}
			>
				<rect width={project.width} height={project.height} fill="none" stroke="#ffffff30" vectorEffect="non-scaling-stroke" />
				<StageContent project={project} t={time} />
				{selection.map((id) => {
					const layer = project.layers.find((l) => l.id === id);
					if (!layer || !layer.visible) return null;
					const { w, h } = layerSize(layer);
					const s = valueAt({ layer, prop: "scale", t: time }) || 1;
					const hs = handle / s;
					return (
						<g key={id} transform={layerTransform({ layer, t: time })} pointerEvents={layer.locked ? "none" : undefined}>
							<rect width={w} height={h} fill="none" stroke="#22D3EE" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
							{single?.id === id && !layer.locked && editingPath !== id && (
								<>
									{[
										[0, 0],
										[w, 0],
										[w, h],
										[0, h],
									].map(([x, y]) => (
										<rect
											key={`${x}-${y}`}
											data-handle="scale"
											x={x - hs / 2}
											y={y - hs / 2}
											width={hs}
											height={hs}
											fill="#fff"
											stroke="#22D3EE"
											vectorEffect="non-scaling-stroke"
											style={{ cursor: "nwse-resize" }}
										/>
									))}
									<line x1={w / 2} x2={w / 2} y1={0} y2={-hs * 3} stroke="#22D3EE" vectorEffect="non-scaling-stroke" />
									<circle data-handle="rotate" cx={w / 2} cy={-hs * 3} r={hs / 1.6} fill="#22D3EE" style={{ cursor: "grab" }} />
									<circle cx={layer.anchorX * w} cy={layer.anchorY * h} r={hs / 3} fill="none" stroke="#fff" vectorEffect="non-scaling-stroke" pointerEvents="none" />
								</>
							)}
						</g>
					);
				})}
				{pathLayer?.kind === "path" && (
					<g transform={layerTransform({ layer: pathLayer, t: time })} data-path-editor>
						{pathLayer.points.map((pt, i) => {
							const s = valueAt({ layer: pathLayer, prop: "scale", t: time }) || 1;
							const hs = handle / s;
							return (
								// biome-ignore lint/suspicious/noArrayIndexKey: points are positional
								<g key={i}>
									{(["in", "out"] as const).map((part) => {
										const hnd = pt[part];
										if (!hnd) return null;
										return (
											<g key={part}>
												<line x1={pt.x} y1={pt.y} x2={pt.x + hnd.x} y2={pt.y + hnd.y} stroke="#F59E0B" vectorEffect="non-scaling-stroke" />
												<circle data-handle={`pt:${i}:${part}`} cx={pt.x + hnd.x} cy={pt.y + hnd.y} r={hs / 2.2} fill="#F59E0B" />
											</g>
										);
									})}
									<rect
										data-handle={`pt:${i}:point`}
										x={pt.x - hs / 2}
										y={pt.y - hs / 2}
										width={hs}
										height={hs}
										fill={i === 0 ? "#22D3EE" : "#fff"}
										stroke="#0f172a"
										vectorEffect="non-scaling-stroke"
									/>
								</g>
							);
						})}
					</g>
				)}
				{guides.map((g) =>
					g.axis === "x" ? (
						<line key={`x${g.at}`} x1={g.at} x2={g.at} y1={-10000} y2={10000} stroke="#F43F5E" vectorEffect="non-scaling-stroke" data-guide />
					) : (
						<line key={`y${g.at}`} y1={g.at} y2={g.at} x1={-10000} x2={10000} stroke="#F43F5E" vectorEffect="non-scaling-stroke" data-guide />
					),
				)}
			</svg>
			<Ruler axis="x" view={view} size={project.width} length={size.w - RULER} />
			<Ruler axis="y" view={view} size={project.height} length={size.h - RULER} />
			<div className="bg-muted/60 absolute top-0 left-0" style={{ width: RULER, height: RULER }} />
			<div className="bg-background/80 text-muted-foreground absolute right-2 bottom-2 flex items-center gap-1 border px-1 text-[11px]">
				<button type="button" className="px-1.5 py-0.5 hover:text-foreground" onClick={() => setView((v) => ({ ...v, zoom: v.zoom / 1.25 }))} aria-label="Zoom out">
					−
				</button>
				<button type="button" className="min-w-12 px-1 hover:text-foreground" onClick={fit} title="Fit (Ctrl+0)" data-motion-zoom>
					{Math.round(view.zoom * 100)}%
				</button>
				<button type="button" className="px-1.5 py-0.5 hover:text-foreground" onClick={() => setView((v) => ({ ...v, zoom: v.zoom * 1.25 }))} aria-label="Zoom in">
					+
				</button>
			</div>
		</div>
	);
}
