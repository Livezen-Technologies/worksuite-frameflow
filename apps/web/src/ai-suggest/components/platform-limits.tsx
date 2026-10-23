"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlatformLimits } from "../platforms";

/** Settings → AI: clip lengths per platform, editable (SRS AI-54). */
export function PlatformLimitsSection() {
	const platforms = usePlatformLimits((s) => s.platforms);
	const update = usePlatformLimits((s) => s.update);
	const reset = usePlatformLimits((s) => s.reset);
	return (
		<section className="flex flex-col gap-2" data-platform-limits>
			<h3 className="text-sm font-semibold">Clip lengths</h3>
			<p className="text-muted-foreground text-xs">
				Shortest and longest clip AI suggests for each platform. Platforms
				change their limits, so set them here.
			</p>
			{platforms.map((p) => (
				<div key={p.id} className="flex items-center gap-2 text-xs">
					<span className="w-32 truncate">{p.name}</span>
					<Input
						type="number"
						min={1}
						className="h-7 w-20"
						aria-label={`${p.name} shortest seconds`}
						value={p.minSeconds}
						onChange={(e) => update({ id: p.id, patch: { minSeconds: Math.max(1, Number(e.target.value) || 1) } })}
					/>
					<span>–</span>
					<Input
						type="number"
						min={1}
						className="h-7 w-20"
						aria-label={`${p.name} longest seconds`}
						value={p.maxSeconds}
						onChange={(e) => update({ id: p.id, patch: { maxSeconds: Math.max(1, Number(e.target.value) || 1) } })}
					/>
					<span className="text-muted-foreground">s</span>
				</div>
			))}
			<Button size="sm" variant="ghost" className="w-fit" onClick={reset}>
				Reset to defaults
			</Button>
		</section>
	);
}
