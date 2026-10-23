"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditor } from "@/editor/use-editor";
import { AiCostNote } from "@/ai/components/ai-spending";
import { aiProvider } from "@/ai/provider";
import { DEFAULT_REGION, clampRegion, type PrivacyRegion } from "@/privacy/region";
import { useTranscriptStore } from "@/transcript/store";
import { mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";
import { cn } from "@/utils/ui";
import { approveSuggestion, rejectSuggestion } from "../apply";
import { usePlatformLimits } from "../platforms";
import { useCloudPrivacy } from "../privacy";
import { suggestClips, suggestReframe } from "../run";
import { type Suggestion, useSuggestions } from "../store";

const EMPTY: Suggestion[] = [];
const NO_REGIONS: PrivacyRegion[] = [];

const clock = (seconds: number) =>
	`${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/**
 * AI suggestions (SRS AI-52, AI-53): shown dashed with the model's
 * confidence; nothing changes until one is approved.
 */
export function AiSuggestionsPanel() {
	const editor = useEditor();
	const projectId = useEditor((e) => e.project.getActive().metadata.id);
	const all = useSuggestions((s) => s.byProject[projectId] ?? EMPTY);
	const pending = useMemo(() => all.filter((s) => s.status === "pending"), [all]);
	const platforms = usePlatformLimits((s) => s.platforms);
	const [platformId, setPlatformId] = useState(platforms[0]?.id ?? "");
	const platform = platforms.find((p) => p.id === platformId) ?? platforms[0];
	const transcript = useTranscriptStore((s) => s.byProject[projectId] ?? null);
	const seconds = useEditor((e) => e.timeline.getTotalDuration() / TICKS_PER_SECOND);
	const [busy, setBusy] = useState<string | null>(null);

	const run = async ({ label, job }: { label: string; job: () => Promise<number> }) => {
		setBusy(label);
		try {
			const n = await job();
			toast.success(n ? `${n} suggestion${n === 1 ? "" : "s"} to review` : "No suggestions this time");
		} catch (error) {
			toast.error(`${label} failed`, {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(null);
		}
	};

	const chars = transcript?.segments.reduce((n, s) => n + s.text.length + 30, 0) ?? 0;
	return (
		<div className="bg-card flex flex-col gap-2 rounded-lg border p-3" data-ai-suggestions>
			<div className="text-sm font-medium">AI suggestions</div>
			<p className="text-muted-foreground m-0 text-xs">
				Suggestions are only suggestions: nothing changes until you approve
				one. Confidence is the model&apos;s own estimate, not a prediction of
				views.
			</p>
			<div className="flex items-center gap-2">
				<Label htmlFor="ai-platform" className="text-xs">
					For
				</Label>
				<select
					id="ai-platform"
					className="bg-background h-8 min-w-0 flex-1 rounded-md border px-2 text-xs"
					value={platform?.id}
					onChange={(e) => setPlatformId(e.target.value)}
				>
					{platforms.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name} ({p.minSeconds}–{p.maxSeconds} s)
						</option>
					))}
				</select>
				<Button
					size="sm"
					variant="outline"
					disabled={!!busy || !transcript || !platform}
					data-suggest-clips
					onClick={() =>
						platform &&
						void run({ label: "Clip suggestions", job: () => suggestClips({ editor, platform }) })
					}
				>
					Suggest clips
				</Button>
			</div>
			{transcript ? (
				<AiCostNote estimate={aiProvider().estimateCost({ textChars: chars, outputChars: 2000 })} />
			) : (
				<p className="text-muted-foreground m-0 text-[11px]">Make a transcript first.</p>
			)}
			<Button
				size="sm"
				variant="outline"
				className="w-fit"
				disabled={!!busy || seconds <= 0}
				data-suggest-reframe
				onClick={() => void run({ label: "Reframe suggestions", job: () => suggestReframe({ editor }) })}
			>
				Suggest vertical reframe
			</Button>
			<AiCostNote
				estimate={aiProvider().estimateCost({
					images: Math.min(20, Math.ceil(seconds / Math.max(2, seconds / 20))),
					outputChars: 1500,
				})}
			/>
			{busy && (
				<p className="text-muted-foreground m-0 text-xs" role="status">
					{busy}…
				</p>
			)}
			<HiddenAreas projectId={projectId} />
			<div className="flex flex-col gap-1.5">
				{pending.map((s) => (
					<div
						key={s.id}
						className="flex flex-col gap-1 rounded-md border border-dashed border-amber-500/70 p-2"
						data-suggestion={s.kind}
					>
						<div className="flex items-center gap-2 text-xs">
							<span className="font-medium">
								{s.kind === "clip" ? s.title || "Clip" : "Reframe"}
							</span>
							<span
								className="rounded-full border border-amber-500/70 px-1.5 text-[10px]"
								data-confidence
							>
								{Math.round(s.confidence * 100)}%
							</span>
							<span className="text-muted-foreground ml-auto tabular-nums">
								{clock(s.start)}–{clock(s.end)}
							</span>
						</div>
						{s.reason && <p className="text-muted-foreground m-0 text-[11px]">{s.reason}</p>}
						{s.kind === "clip" && (
							<p className="text-muted-foreground m-0 text-[11px]">
								{s.layout} · captions {s.captionStyle ?? "as they are"}
							</p>
						)}
						<div className="flex gap-1.5">
							<Button
								size="sm"
								variant="ghost"
								className="h-6 text-xs"
								onClick={() =>
									editor.playback.seek({ time: mediaTimeFromSeconds({ seconds: s.start }) })
								}
							>
								Show
							</Button>
							<Button
								size="sm"
								className="h-6 text-xs"
								data-approve
								onClick={() =>
									void approveSuggestion({ editor, suggestion: s }).then(() =>
										toast.success(
											s.kind === "clip" ? `"${s.title ?? "Clip"}" is now its own sequence` : "Reframed",
										),
									)
								}
							>
								Approve
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="h-6 text-xs"
								data-reject
								onClick={() => rejectSuggestion({ editor, id: s.id })}
							>
								Reject
							</Button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

/** Areas blurred out of frames sent to the cloud (AI-50). */
function HiddenAreas({ projectId }: { projectId: string }) {
	const regions = useCloudPrivacy((s) => s.byProject[projectId] ?? NO_REGIONS);
	const setRegions = useCloudPrivacy((s) => s.set);
	const update = ({ index, patch }: { index: number; patch: Partial<PrivacyRegion> }) =>
		setRegions({
			projectId,
			regions: regions.map((r, i) => (i === index ? clampRegion({ ...r, ...patch }) : r)),
		});
	return (
		<div className="flex flex-col gap-1.5 border-t pt-2" data-hidden-areas>
			<div className="flex items-center justify-between">
				<span className="text-xs font-medium">Hide from AI</span>
				<Button
					size="sm"
					variant="ghost"
					className="h-6 text-xs"
					onClick={() => setRegions({ projectId, regions: [...regions, DEFAULT_REGION] })}
					data-add-hidden-area
				>
					Add area
				</Button>
			</div>
			<p className="text-muted-foreground m-0 text-[11px]">
				Blurred out of every frame before it&apos;s sent to a cloud model, e.g.
				passwords or customer details on screen.
			</p>
			{regions.map((region, index) => (
				<div key={index} className="flex items-end gap-1" data-hidden-area={index}>
					{(["x", "y", "width", "height"] as const).map((key) => {
						const id = `hidden-${index}-${key}`;
						return (
							<div key={key} className="flex min-w-0 flex-col">
								<Label htmlFor={id} className="text-muted-foreground text-[10px]">
									{key === "x" ? "Left" : key === "y" ? "Top" : key === "width" ? "Width" : "Height"} %
								</Label>
								<Input
									id={id}
									type="number"
									className={cn("h-7 w-16 text-xs")}
									value={Math.round(region[key] * 100)}
									onChange={(e) => update({ index, patch: { [key]: Number(e.target.value) / 100 } })}
								/>
							</div>
						);
					})}
					<Button
						size="sm"
						variant="ghost"
						className="h-7 px-2 text-xs"
						aria-label="Remove area"
						onClick={() => setRegions({ projectId, regions: regions.filter((_, i) => i !== index) })}
					>
						×
					</Button>
				</div>
			))}
		</div>
	);
}
