"use client";

import { useRef } from "react";
import { cn } from "@/utils/ui";
import { EASES, type Ease } from "../model";

const SIZE = 150;
const PAD = 14;

const PRESETS: Array<{ label: string; ease: Ease }> = [
	{ label: "Linear", ease: EASES.linear },
	{ label: "Ease in", ease: EASES.easeIn },
	{ label: "Ease out", ease: EASES.easeOut },
	{ label: "Ease in-out", ease: EASES.easeInOut },
	{ label: "Back out", ease: [0.34, 1.56, 0.64, 1] },
	{ label: "Snappy", ease: [0.7, 0, 0.2, 1] },
];

const same = ({ a, b }: { a: Ease; b: Ease }) => a.every((v, i) => Math.abs(v - b[i]) < 1e-3);

/**
 * Cubic-bezier easing editor: drag the two handles (y may overshoot for
 * bounce-back curves), pick a preset, or type the four numbers.
 */
export function CurveEditor({ ease, onChange, onCommit }: { ease: Ease; onChange: (e: Ease) => void; onCommit: () => void }) {
	const svgRef = useRef<SVGSVGElement>(null);
	const drag = useRef<0 | 1 | null>(null);
	const [x1, y1, x2, y2] = ease;
	const inner = SIZE - PAD * 2;
	const px = (x: number) => PAD + x * inner;
	const py = (y: number) => SIZE - PAD - y * inner;

	const move = (e: React.PointerEvent) => {
		const which = drag.current;
		const rect = svgRef.current?.getBoundingClientRect();
		if (which === null || !rect) return;
		const scale = SIZE / rect.width;
		const x = Math.min(1, Math.max(0, ((e.clientX - rect.left) * scale - PAD) / inner));
		const y = Math.min(2, Math.max(-1, (SIZE - PAD - (e.clientY - rect.top) * scale) / inner));
		const r = (n: number) => Math.round(n * 100) / 100;
		onChange(which === 0 ? [r(x), r(y), x2, y2] : [x1, y1, r(x), r(y)]);
	};

	return (
		<div className="flex flex-col gap-2" data-curve-editor>
			<svg
				ref={svgRef}
				viewBox={`0 0 ${SIZE} ${SIZE}`}
				className="bg-muted/40 mx-auto w-full max-w-[140px] touch-none overflow-visible border"
				onPointerMove={move}
				onPointerUp={() => {
					if (drag.current !== null) onCommit();
					drag.current = null;
				}}
			>
				<line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} stroke="currentColor" opacity={0.15} />
				<rect x={px(0)} y={py(1)} width={inner} height={inner} fill="none" stroke="currentColor" opacity={0.15} />
				<path
					d={`M${px(0)} ${py(0)} C${px(x1)} ${py(y1)} ${px(x2)} ${py(y2)} ${px(1)} ${py(1)}`}
					fill="none"
					stroke="#22D3EE"
					strokeWidth={2.5}
				/>
				<line x1={px(0)} y1={py(0)} x2={px(x1)} y2={py(y1)} stroke="#F59E0B" />
				<line x1={px(1)} y1={py(1)} x2={px(x2)} y2={py(y2)} stroke="#F59E0B" />
				{([0, 1] as const).map((i) => (
					<circle
						key={i}
						cx={px(i === 0 ? x1 : x2)}
						cy={py(i === 0 ? y1 : y2)}
						r={6}
						fill="#F59E0B"
						style={{ cursor: "grab" }}
						data-curve-handle={i}
						onPointerDown={(e) => {
							e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
							drag.current = i;
						}}
					/>
				))}
			</svg>
			<div className="flex flex-wrap gap-1">
				{PRESETS.map((p) => (
					<button
						key={p.label}
						type="button"
						data-ease-preset={p.label}
						onClick={() => {
							onChange(p.ease);
							onCommit();
						}}
						className={cn("border px-1.5 py-0.5 text-[10px]", same({ a: p.ease, b: ease }) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}
					>
						{p.label}
					</button>
				))}
			</div>
			<input
				key={ease.join(",")}
				defaultValue={ease.join(", ")}
				aria-label="Cubic bezier"
				className="bg-muted/50 h-6 border px-1.5 font-mono text-[11px]"
				onBlur={(e) => {
					const n = e.target.value.split(/[\s,]+/).filter(Boolean).map(Number);
					if (n.length === 4 && n.every(Number.isFinite)) {
						onChange([Math.min(1, Math.max(0, n[0])), n[1], Math.min(1, Math.max(0, n[2])), n[3]]);
						onCommit();
					}
				}}
				onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
			/>
		</div>
	);
}
