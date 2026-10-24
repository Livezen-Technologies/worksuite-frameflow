"use client";

import { useEffect, useState } from "react";
import { useBrandKit } from "@/brand/store";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/editor/use-editor";
import type { GraphicElement } from "@/timeline";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { mediaTimeFromSeconds, roundMediaTime } from "@/wasm";
import { findPackAsset, type PackIndexAsset, resolvePackVariant } from "../catalog";
import { brandColorOverrides, resolveSlotColors, setSlotColor, switchLottieVariant } from "../element";
import type { LottieColorSlot, LottieElementData, LottieSource } from "../types";
import { getUserLottie } from "../user-library";
import { exportLottieClip } from "../io/export-actions";
import { toast } from "sonner";
import { userAsset } from "../player";
import { motionProjectIdOf } from "@/motion-studio/video-link";
import { useMotionEditor } from "../motion-editor/store";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** Colour slots of an animation: from the pack's metadata or the imported file. */
function useColorSlots(source: LottieSource): LottieColorSlot[] | null {
	const key = source.kind === "pack" ? `pack:${source.assetId}` : source.kind === "user" ? `user:${source.id}` : `backdrop:${source.spec}`;
	const [slots, setSlots] = useState<{ key: string; slots: LottieColorSlot[] } | null>(null);
	useEffect(() => {
		let cancelled = false;
		const load =
			source.kind === "pack"
				? findPackAsset(source.assetId, source.pack).then((asset) => asset?.colors ?? [])
				: source.kind === "user"
					? getUserLottie(source.id).then((entry) => entry?.colors ?? [])
					: Promise.resolve([]);
		load
			.then((result) => !cancelled && setSlots({ key, slots: result }))
			.catch(() => !cancelled && setSlots({ key, slots: [] }));
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the source
	}, [key]);
	return slots?.key === key ? slots.slots : null;
}

/** The library entry of a pack animation (for its language variants). */
function usePackAsset(source: LottieSource): PackIndexAsset | null {
	const assetId = source.kind === "pack" ? source.assetId : source.kind === "user" ? source.id : source.spec;
	const pack = source.kind === "pack" ? source.pack : undefined;
	const isUser = source.kind === "user";
	const [asset, setAsset] = useState<PackIndexAsset | null>(null);
	useEffect(() => {
		if (!assetId) return;
		let cancelled = false;
		(isUser ? userAsset(assetId) : findPackAsset(assetId, pack))
			.then((found) => !cancelled && setAsset(found))
			.catch(() => !cancelled && setAsset(null));
		return () => {
			cancelled = true;
		};
	}, [assetId]);
	return asset && asset.id === assetId ? asset : null;
}

/** Properties for an animation (Lottie) graphic: colours, speed and looping. */
export function LottieTab({
	element,
	trackId,
}: {
	element: GraphicElement & { lottie: LottieElementData };
	trackId: string;
}) {
	const editor = useEditor();
	const brandColors = useBrandKit((kit) => kit.colors);
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const live = (renderElement as GraphicElement).lottie ?? element.lottie;
	const slots = useColorSlots(live.source);
	const packAsset = usePackAsset(live.source);
	const variants = packAsset?.variants ?? [];

	const update = (lottie: LottieElementData, extra: Partial<GraphicElement> = {}) =>
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, patch: { lottie, ...extra } }],
		});

	const setColors = (colors: Record<string, string>) => update({ ...live, colors });

	const setSpeed = (speed: number) => {
		// Keep the clip covering one play-through when it was exactly that long.
		const once = (s: number) =>
			roundMediaTime({ time: mediaTimeFromSeconds({ seconds: live.frames / live.fps / s }) });
		const wasNatural = Math.abs(element.duration - once(live.speed)) < 2;
		update({ ...live, speed }, wasNatural && !live.loop ? { duration: once(speed) } : {});
	};

	const resolved = slots ? resolveSlotColors({ slots, overrides: live.colors }) : [];
	const changed = Object.keys(live.colors).length > 0;

	return (
		<div className="flex flex-col">
			<div className="px-4 pt-3">
				<Button
					variant="secondary"
					size="sm"
					className="w-full"
					onClick={() => useMotionEditor.getState().openFor({ trackId, elementId: element.id })}
				>
					Edit motion…
				</Button>
				{live.source.kind === "user" && motionProjectIdOf(live.source.id) && (
					<Button
						variant="outline"
						size="sm"
						className="mt-1.5 w-full"
						data-open-in-motion-studio
						onClick={() => window.open(`/motion/${motionProjectIdOf(live.source.kind === "user" ? live.source.id : "")}`, "_blank")}
					>
						Open in Motion Studio
					</Button>
				)}
				<div className="mt-1.5 grid grid-cols-2 gap-1.5">
					{(["json", "lottie"] as const).map((format) => (
						<Button
							key={format}
							variant="outline"
							size="sm"
							data-export-lottie={format}
							onClick={() =>
								exportLottieClip({ lottie: live, name: element.name || "animation", format }).catch((e: unknown) =>
									toast.error(e instanceof Error ? e.message : "Export failed"),
								)
							}
						>
							Export {format === "json" ? "JSON" : ".lottie"}
						</Button>
					))}
				</div>
				{(packAsset?.textSlots?.length || packAsset?.imageSlots?.length) ? (
					<p className="text-muted-foreground mt-1.5 text-xs">Change the words, fonts and pictures (e.g. your channel photo).</p>
				) : null}
			</div>
			{packAsset && variants.length > 1 && (
				<Section collapsible sectionKey={`${element.id}:lottie-language`}>
					<SectionHeader>
						<SectionTitle>Language</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<SectionFields>
							<SectionField label="Words">
								<Select
									value={resolvePackVariant(packAsset, live.source.kind === "pack" ? live.source.variant : null)}
									onValueChange={(variant) => update(switchLottieVariant({ data: live, asset: packAsset, variant }))}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{variants.map((variant) => (
											<SelectItem key={variant.id} value={variant.id} lang={variant.lang}>
												{variant.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</SectionField>
						</SectionFields>
					</SectionContent>
				</Section>
			)}
			<Section collapsible sectionKey={`${element.id}:lottie-colors`}>
				<SectionHeader>
					<SectionTitle>Colours</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						{slots === null && <p className="text-muted-foreground text-xs">Loading…</p>}
						{slots?.length === 0 && (
							<p className="text-muted-foreground text-xs">This animation has no colours to change.</p>
						)}
						{resolved.map((slot) => (
							<SectionField key={slot.id} label={slot.name}>
								<ColorPicker
									value={slot.value.replace(/^#/, "").toUpperCase()}
									onChange={(color) =>
										previewUpdates({
											lottie: { ...live, colors: setSlotColor({ overrides: live.colors, slot, color: `#${color}` }) },
										} as Partial<GraphicElement>)
									}
									onChangeEnd={(color) => {
										previewUpdates({
											lottie: { ...live, colors: setSlotColor({ overrides: live.colors, slot, color: `#${color}` }) },
										} as Partial<GraphicElement>);
										commit();
									}}
								/>
							</SectionField>
						))}
						{slots && slots.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{brandColors.length > 0 && (
									<Button
										variant="outline"
										size="sm"
										onClick={() => setColors(brandColorOverrides({ slots, brandColors }))}
									>
										Use brand colours
									</Button>
								)}
								<Button variant="ghost" size="sm" disabled={!changed} onClick={() => setColors({})}>
									Reset colours
								</Button>
							</div>
						)}
						{brandColors.length > 0 && resolved.length > 0 && (
							<div className="flex flex-wrap items-center gap-1.5" aria-label="Brand colours">
								{brandColors.map((color) => (
									<button
										key={color}
										type="button"
										title={`Set ${resolved[0].name} to ${color}`}
										className="size-5 rounded-full ring-1 ring-white/20"
										style={{ background: color }}
										onClick={() =>
											setColors(setSlotColor({ overrides: live.colors, slot: resolved[0], color }))
										}
									/>
								))}
							</div>
						)}
					</SectionFields>
				</SectionContent>
			</Section>
			<Section collapsible sectionKey={`${element.id}:lottie-playback`}>
				<SectionHeader>
					<SectionTitle>Playback</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<SectionField label="Speed">
							<Select value={String(live.speed)} onValueChange={(value) => setSpeed(Number(value))}>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{SPEEDS.map((speed) => (
										<SelectItem key={speed} value={String(speed)}>
											{speed}×
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
						<SectionField label="Loop">
							<Switch checked={live.loop} onCheckedChange={(loop) => update({ ...live, loop })} />
						</SectionField>
					</SectionFields>
				</SectionContent>
			</Section>
		</div>
	);
}
