"use client";

import { useRef } from "react";

const SIZE = 104;
const RADIUS = SIZE / 2;

/**
 * Colour wheel with a draggable puck (x/y −1…1) and a master slider.
 * Double-click the wheel to reset the puck. Arrow keys nudge it.
 */
export function ColorWheel({
	label,
	x,
	y,
	master,
	onPreview,
	onCommit,
}: {
	label: string;
	x: number;
	y: number;
	master: number;
	onPreview: (values: { x?: number; y?: number; master?: number }) => void;
	onCommit: () => void;
}) {
	const discRef = useRef<HTMLDivElement>(null);
	const dragging = useRef(false);

	const fromPointer = (event: React.PointerEvent) => {
		const rect = discRef.current?.getBoundingClientRect();
		if (!rect) return;
		let nx = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
		let ny = -(event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
		const length = Math.hypot(nx, ny);
		if (length > 1) {
			nx /= length;
			ny /= length;
		}
		onPreview({ x: round(nx), y: round(ny) });
	};

	const onKeyDown = (event: React.KeyboardEvent) => {
		const step = event.shiftKey ? 0.1 : 0.02;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, step],
			ArrowDown: [0, -step],
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		onPreview({ x: clamp(round(x + move[0])), y: clamp(round(y + move[1])) });
		onCommit();
	};

	const valueText = `${label}: ${formatPush({ x, y })}, master ${formatSigned(master)}`;

	return (
		<div className="flex flex-col items-center gap-1.5">
			<div
				ref={discRef}
				role="slider"
				tabIndex={0}
				aria-label={`${label} wheel`}
				aria-valuetext={valueText}
				aria-valuenow={Math.round(Math.hypot(x, y) * 100)}
				aria-valuemin={0}
				aria-valuemax={100}
				onPointerDown={(event) => {
					dragging.current = true;
					event.currentTarget.setPointerCapture(event.pointerId);
					fromPointer(event);
				}}
				onPointerMove={(event) => dragging.current && fromPointer(event)}
				onPointerUp={() => {
					if (!dragging.current) return;
					dragging.current = false;
					onCommit();
				}}
				onDoubleClick={() => {
					onPreview({ x: 0, y: 0 });
					onCommit();
				}}
				onKeyDown={onKeyDown}
				className="focus-visible:ring-ring relative shrink-0 cursor-crosshair touch-none rounded-full p-[6px] focus-visible:ring-2 focus-visible:outline-hidden"
				style={{
					width: SIZE + 12,
					height: SIZE + 12,
					background:
						"conic-gradient(from 90deg, #E05A5A, #C85AE0, #5A6AE0, #5AC8E0, #5AE07A, #E0C85A, #E05A5A)",
				}}
			>
				<div className="bg-card relative size-full rounded-full">
					<span
						aria-hidden="true"
						className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
						style={{
							left: RADIUS + x * (RADIUS - 6),
							top: RADIUS - y * (RADIUS - 6),
						}}
					/>
					<span
						aria-hidden="true"
						className="bg-border absolute top-1/2 left-1/2 size-1 -translate-1/2 rounded-full"
					/>
				</div>
			</div>
			<div className="text-xs font-semibold">{label}</div>
			<label className="flex w-full items-center gap-1.5 text-[11px]">
				<span className="sr-only">{label} master</span>
				<input
					type="range"
					min={-1}
					max={1}
					step={0.01}
					value={master}
					onChange={(event) =>
						onPreview({ master: Number(event.target.value) })
					}
					onPointerUp={onCommit}
					onKeyUp={onCommit}
					onDoubleClick={() => {
						onPreview({ master: 0 });
						onCommit();
					}}
					className="accent-primary w-full"
				/>
				<span className="text-muted-foreground w-9 text-right tabular-nums">
					{formatSigned(master)}
				</span>
			</label>
		</div>
	);
}

function round(value: number) {
	return Math.round(value * 100) / 100;
}

function clamp(value: number) {
	return Math.max(-1, Math.min(1, value));
}

function formatSigned(value: number) {
	const fixed = value.toFixed(2);
	return value > 0 ? `+${fixed}` : value < 0 ? `−${fixed.slice(1)}` : "0.00";
}

function formatPush({ x, y }: { x: number; y: number }) {
	const amount = Math.round(Math.min(1, Math.hypot(x, y)) * 100);
	if (amount === 0) return "neutral";
	const degrees = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
	return `${amount}% toward ${degrees}°`;
}
