"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useWorksuiteAccount } from "@/account/use-worksuite-account";
import { featureAccess, type ExportFeature } from "@/export/plan";
import { formatEstimate } from "@/export/time-estimate";
import { judgeHardware, readHardware, type HardwareVerdict } from "../hardware";
import { modelFor, readModel, refreshInstalledModels, useAiModels } from "../models";
import { ModelRow } from "./local-models";
import { AiPreviewDialog } from "./ai-preview-dialog";

export interface AiChoice {
	upscale: boolean;
	interpolate: boolean;
}

type Size = { width: number; height: number };

/**
 * AI Ultra HD and optical flow in the Export window (SRS EX-20–EX-24,
 * EX-26, EX-27): model status, hardware check, plan label, the extra time
 * each adds, and an Example before/after.
 */
export function AiExportOptions({
	value,
	onChange,
	outputSize,
	projectSize,
	exportFps,
	projectFps,
	frames,
	onSuggestLevel,
	onExtraMs,
}: {
	value: AiChoice;
	onChange: (value: AiChoice) => void;
	outputSize: Size;
	projectSize: Size;
	exportFps: number;
	projectFps: number;
	frames: number;
	onSuggestLevel: (level: number) => void;
	onExtraMs: (ms: number) => void;
}) {
	const account = useWorksuiteAccount();
	const profile = account.state?.profile ?? null;
	const installed = useAiModels((s) => s.installed);
	const [hardware, setHardware] = useState<Awaited<ReturnType<typeof readHardware>> | null>(null);
	const [extra, setExtra] = useState<{ upscale?: number; interpolate?: number }>({});
	const [preview, setPreview] = useState<"upscale" | "interpolate" | null>(null);

	useEffect(() => {
		void refreshInstalledModels();
		void readHardware().then(setHardware);
	}, []);

	const upscaleUseful =
		Math.min(outputSize.width, outputSize.height) >
		Math.min(projectSize.width, projectSize.height);
	const interpolateUseful = exportFps >= projectFps * 1.9;

	// Time each stage on this machine once it's chosen (EX-22).
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const next: { upscale?: number; interpolate?: number } = {};
			if (value.upscale && installed[modelFor("upscale").id]) {
				const bytes = await readModel(modelFor("upscale").id);
				if (bytes) {
					const { Upscaler } = await import("../upscale");
					const up = await Upscaler.create(bytes).catch(() => null);
					if (up) {
						const ms = await up.benchmark();
						next.upscale = ms * up.tilesFor(projectSize);
						up.release();
					}
				}
			}
			if (value.interpolate && installed[modelFor("interpolate").id]) {
				const bytes = await readModel(modelFor("interpolate").id);
				if (bytes) {
					const { Interpolator } = await import("../interpolate");
					const it = await Interpolator.create(bytes).catch(() => null);
					if (it) {
						// Half the output frames are made, at the output size.
						next.interpolate = (await it.benchmark(outputSize)) / 2;
						it.release();
					}
				}
			}
			if (!cancelled) {
				setExtra(next);
				onExtraMs((next.upscale ?? 0) + (next.interpolate ?? 0));
			}
		})().catch(() => {});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- sizes are rebuilt each render
	}, [
		value.upscale,
		value.interpolate,
		installed,
		projectSize.width,
		projectSize.height,
		outputSize.width,
		outputSize.height,
	]);

	const verdict = (kind: "upscale" | "interpolate"): HardwareVerdict | null =>
		hardware
			? judgeHardware({
					kind,
					width: outputSize.width,
					height: outputSize.height,
					...hardware,
				})
			: null;

	const row = ({
		kind,
		feature,
		label,
		useful,
		hint,
	}: {
		kind: "upscale" | "interpolate";
		feature: ExportFeature;
		label: string;
		useful: boolean;
		hint: string;
	}) => {
		const access = featureAccess({ profile, feature });
		const model = modelFor(kind);
		const hasModel = !!installed[model.id];
		const hw = verdict(kind);
		const checked = value[kind];
		const id = `ai-${kind}`;
		const disabled = !useful || !access.allowed || hw?.ok === false || !hasModel;
		const ms = extra[kind];
		return (
			<div className="flex flex-col gap-1.5" data-ai-option={kind}>
				<div className="flex flex-wrap items-center gap-2">
					<Checkbox
						id={id}
						checked={checked && !disabled}
						disabled={disabled}
						onCheckedChange={(v) => onChange({ ...value, [kind]: !!v })}
					/>
					<Label htmlFor={id} className="text-xs font-medium">
						{label}
					</Label>
					{access.label && (
						<span
							className="rounded-full border px-1.5 text-[10px]"
							data-plan-label={feature}
						>
							{access.label}
						</span>
					)}
					{checked && ms !== undefined && (
						<span className="text-muted-foreground text-[11px]" data-ai-extra={kind}>
							+{formatEstimate((ms * frames) / 1000).replace("about ", "")} with{" "}
							{label}
						</span>
					)}
					<Button
						size="sm"
						variant="ghost"
						className="ml-auto h-6 text-xs"
						disabled={!hasModel}
						onClick={() => setPreview(kind)}
						data-ai-example={kind}
					>
						Example
					</Button>
				</div>
				<p className="text-muted-foreground m-0 text-[11px]">
					{!useful ? hint : hw?.ok === false ? hw.reason : model.about}
					{hw?.ok && hw.slow && useful
						? " No supported graphics card found: this runs on the CPU and is slow."
						: ""}
				</p>
				{hw?.ok === false && hw.suggestedLevel && (
					<Button
						size="sm"
						variant="outline"
						className="h-6 w-fit text-xs"
						onClick={() => onSuggestLevel(hw.suggestedLevel ?? 1080)}
					>
						Use {hw.suggestedLevel}p instead
					</Button>
				)}
				{!hasModel && useful && <ModelRow model={model} compact />}
			</div>
		);
	};

	return (
		<div className="flex flex-col gap-3 rounded-md border p-3" data-ai-export>
			<span className="text-xs font-medium">AI enhancement</span>
			{row({
				kind: "upscale",
				feature: "ai-ultra-hd",
				label: "AI Ultra HD",
				useful: upscaleUseful,
				hint: "Turns on when exporting above the project's resolution.",
			})}
			{row({
				kind: "interpolate",
				feature: "optical-flow",
				label: "Optical flow",
				useful: interpolateUseful,
				hint: `Turns on when the export frame rate is double the project's (${Math.round(projectFps)} → ${Math.round(projectFps * 2)} fps).`,
			})}
			<p className="text-muted-foreground m-0 text-[11px]">
				Runs only on this computer after the picture is put together, so
				titles and Sinhala captions stay sharp. Nothing is uploaded.
			</p>
			<AiPreviewDialog kind={preview} onClose={() => setPreview(null)} />
		</div>
	);
}
