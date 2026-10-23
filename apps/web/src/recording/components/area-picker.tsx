"use client";

import { useRef, useState } from "react";
import { type CaptureArea, areaFromCorners } from "../area";

/** Drag a box on the screen's picture to record only that part (SC-01). */
export function AreaPicker({
	thumbnail,
	area,
	onChange,
}: {
	thumbnail: string | null;
	area: CaptureArea | null;
	onChange: (area: CaptureArea | null) => void;
}) {
	const frame = useRef<HTMLDivElement>(null);
	const [drag, setDrag] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
	const at = (event: React.PointerEvent): [number, number] => {
		const r = frame.current?.getBoundingClientRect();
		if (!r) return [0, 0];
		return [(event.clientX - r.left) / r.width, (event.clientY - r.top) / r.height];
	};
	const shown = drag ? areaFromCorners(drag) : area;
	return (
		<div className="flex flex-col gap-1 text-[11px]" data-area-picker>
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground">
					{area
						? `Recording ${Math.round(area.width * 100)}% × ${Math.round(area.height * 100)}% of the screen`
						: "Drag on the picture to record only part of the screen"}
				</span>
				{area && (
					<button type="button" className="text-primary hover:underline" onClick={() => onChange(null)} data-area-full>
						Whole screen
					</button>
				)}
			</div>
			<div
				ref={frame}
				role="application"
				aria-label="Recording area"
				data-area-frame
				className="relative aspect-video w-full cursor-crosshair touch-none overflow-hidden rounded border bg-black"
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId);
					const p = at(e);
					setDrag({ a: p, b: p });
				}}
				onPointerMove={(e) => drag && setDrag({ ...drag, b: at(e) })}
				onPointerUp={() => {
					if (drag) {
						const next = areaFromCorners(drag);
						if (next) onChange(next);
					}
					setDrag(null);
				}}
			>
				{thumbnail && (
					// eslint-disable-next-line @next/next/no-img-element -- local data URL
					<img src={thumbnail} alt="" draggable={false} className="pointer-events-none size-full object-fill opacity-70" />
				)}
				{shown && (
					<div
						data-area-box
						className="pointer-events-none absolute border-2 border-[#22D3EE] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
						style={{
							left: `${shown.x * 100}%`,
							top: `${shown.y * 100}%`,
							width: `${shown.width * 100}%`,
							height: `${shown.height * 100}%`,
						}}
					/>
				)}
			</div>
		</div>
	);
}
