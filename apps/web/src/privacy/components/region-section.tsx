"use client";

import type { EffectElement } from "@/timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { clampRegion, DEFAULT_REGION, type PrivacyRegion } from "../region";

const FIELDS: { key: "x" | "y" | "width" | "height" | "feather"; label: string }[] =
	[
		{ key: "x", label: "Left" },
		{ key: "y", label: "Top" },
		{ key: "width", label: "Width" },
		{ key: "height", label: "Height" },
		{ key: "feather", label: "Soft edge" },
	];

/** Limits an effect clip to one area of the frame (SRS ED-15). */
export function RegionSection({
	element,
	onChange,
}: {
	element: EffectElement;
	onChange: (region: PrivacyRegion | undefined) => void;
}) {
	const region = element.region;
	const set = (patch: Partial<PrivacyRegion>) =>
		onChange(clampRegion({ ...(region ?? DEFAULT_REGION), ...patch }));
	return (
		<Section>
			<SectionHeader>
				<SectionTitle>Area</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<div className="flex flex-col gap-2" data-privacy-region>
					<div className="flex gap-2">
						<Button
							size="sm"
							variant={region ? "outline" : "secondary"}
							onClick={() => onChange(undefined)}
							data-region-off
						>
							Whole frame
						</Button>
						<Button
							size="sm"
							variant={region?.shape === "rect" ? "secondary" : "outline"}
							onClick={() => set({ shape: "rect" })}
							data-region-rect
						>
							Rectangle
						</Button>
						<Button
							size="sm"
							variant={region?.shape === "ellipse" ? "secondary" : "outline"}
							onClick={() => set({ shape: "ellipse" })}
							data-region-ellipse
						>
							Ellipse
						</Button>
					</div>
					{region ? (
						<div className="grid grid-cols-2 gap-2">
							{FIELDS.map((field) => {
								const id = `region-${element.id}-${field.key}`;
								return (
									<div key={field.key} className="flex flex-col gap-1">
										<Label htmlFor={id} className="text-xs">
											{field.label} (%)
										</Label>
										<Input
											id={id}
											type="number"
											min={0}
											max={100}
											step={1}
											className="h-8"
											value={Math.round(region[field.key] * 100)}
											onChange={(e) =>
												set({ [field.key]: Number(e.target.value) / 100 })
											}
											data-region-field={field.key}
										/>
									</div>
								);
							})}
						</div>
					) : (
						<p className="text-muted-foreground text-xs">
							Pick a shape to apply this effect to one area only, e.g. to blur
							a password or a face.
						</p>
					)}
				</div>
			</SectionContent>
		</Section>
	);
}
