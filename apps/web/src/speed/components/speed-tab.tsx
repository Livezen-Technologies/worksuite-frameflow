import { useRef, useState } from "react";
import { cn } from "@/utils/ui";
import { TICKS_PER_SECOND } from "@/wasm";
import { readCurve } from "../apply-curve";
import { SpeedCurvePanel } from "./speed-curve";
import { useEditor } from "@/editor/use-editor";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { HugeiconsIcon } from "@hugeicons/react";
import { DashboardSpeed02Icon } from "@hugeicons/core-free-icons";
import { buildConstantRetime } from "@/retime";
import {
	DEFAULT_RETIME_RATE,
	MIN_RETIME_RATE,
	MAX_RETIME_RATE,
	clampRetimeRate,
	canMaintainPitch,
} from "@/retime/rate";
import type { AudioElement, VideoElement } from "@/timeline";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { usePropertyDraft } from "@/components/editor/panels/properties/hooks/use-property-draft";
import {
	formatNumberForDisplay,
	getFractionDigitsForStep,
	snapToStep,
} from "@/utils/math";

const SPEED_STEP = 0.01;
const SPEED_FRACTION_DIGITS = getFractionDigitsForStep({ step: SPEED_STEP });

function rateToDisplay({ rate }: { rate: number }): string {
	return formatNumberForDisplay({
		value: rate,
		fractionDigits: SPEED_FRACTION_DIGITS,
	});
}

function parseSpeedInput({ input }: { input: string }): number | null {
	const parsed = parseFloat(input);
	if (Number.isNaN(parsed)) return null;
	return clampRetimeRate({
		rate: snapToStep({ value: parsed, step: SPEED_STEP }),
	});
}

function buildRetime({
	rate,
	maintainPitch,
}: {
	rate: number;
	maintainPitch: boolean;
}) {
	if (rate === DEFAULT_RETIME_RATE && !maintainPitch) return undefined;
	return buildConstantRetime({ rate, maintainPitch });
}

export function SpeedTab({
	element,
	trackId,
}: {
	element: AudioElement | VideoElement;
	trackId: string;
}) {
	const hasCurve = !!readCurve(element);
	const [mode, setMode] = useState<"normal" | "curve">(
		hasCurve ? "curve" : "normal",
	);
	return (
		<div className="flex flex-col">
			<div className="grid grid-cols-2 gap-1 px-4 pt-3" data-speed-mode>
				{(
					[
						["normal", "Normal"],
						["curve", "Curve"],
					] as const
				).map(([value, label]) => (
					<button
						key={value}
						type="button"
						onClick={() => setMode(value)}
						data-speed-tab={value}
						className={cn(
							"h-8 rounded-md text-sm",
							mode === value
								? "bg-secondary text-foreground font-semibold"
								: "text-muted-foreground hover:bg-accent/40",
						)}
					>
						{label}
					</button>
				))}
			</div>
			{mode === "curve" ? (
				<div className="p-4">
					<SpeedCurvePanel element={element} trackId={trackId} />
				</div>
			) : hasCurve ? (
				<p className="text-muted-foreground m-0 p-4 text-xs leading-relaxed">
					This clip has a speed curve. Choose None under Curve to go back to one
					speed.
				</p>
			) : (
				<NormalSpeed element={element} trackId={trackId} />
			)}
		</div>
	);
}

function NormalSpeed({
	element,
	trackId,
}: {
	element: AudioElement | VideoElement;
	trackId: string;
}) {
	const editor = useEditor();
	const rate = clampRetimeRate({
		rate: element.retime?.rate ?? DEFAULT_RETIME_RATE,
	});
	const isPitchPreserveAvailable = canMaintainPitch({ rate });
	const maintainPitch = element.retime?.maintainPitch ?? false;
	const pendingRateRef = useRef(rate);

	const commitRetime = ({
		rate: nextRate,
		maintainPitch: nextMaintainPitch,
	}: {
		rate: number;
		maintainPitch: boolean;
	}) => {
		editor.timeline.updateElementRetime({
			trackId,
			elementId: element.id,
			retime: buildRetime({ rate: nextRate, maintainPitch: nextMaintainPitch }),
		});
	};

	const speedDraft = usePropertyDraft({
		displayValue: rateToDisplay({ rate }),
		parse: (input) => parseSpeedInput({ input }),
		onPreview: (nextRate) => {
			pendingRateRef.current = nextRate;
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: {
							retime: buildRetime({ rate: nextRate, maintainPitch }),
						},
					},
				],
			});
		},
		onCommit: () => {
			commitRetime({ rate: pendingRateRef.current, maintainPitch });
		},
	});

	return (
		<Section collapsible sectionKey={`${element.id}:speed`}>
			<SectionHeader>
				<SectionTitle>Speed</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<SectionField label="Speed">
						<NumberField
							icon={<HugeiconsIcon icon={DashboardSpeed02Icon} />}
							value={speedDraft.displayValue}
							suffix="x"
							scrubRanges={[
								{ from: 0.01, to: 1, pixelsPerUnit: 160 },
								{ from: 1, to: 5, pixelsPerUnit: 48 },
							]}
							scrubClamp={{ min: MIN_RETIME_RATE, max: MAX_RETIME_RATE }}
							onFocus={() => {
								pendingRateRef.current = rate;
								speedDraft.onFocus();
							}}
							onChange={speedDraft.onChange}
							onBlur={speedDraft.onBlur}
							onScrub={speedDraft.scrubTo}
							onScrubEnd={speedDraft.commitScrub}
							onReset={() =>
								commitRetime({ rate: DEFAULT_RETIME_RATE, maintainPitch })
							}
							isDefault={rate === DEFAULT_RETIME_RATE}
						/>
						{/* 0.1x–5x on a log scale, so 1x sits near the middle like CapCut. */}
						<Slider
							className="mt-3"
							min={0}
							max={1}
							step={0.001}
							value={[speedToSlider(rate)]}
							onValueChange={([v]) => {
								const next = sliderToSpeed(v ?? 0.5);
								pendingRateRef.current = next;
								editor.timeline.previewElements({
									updates: [
										{ trackId, elementId: element.id, updates: { retime: buildRetime({ rate: next, maintainPitch }) } },
									],
								});
							}}
							onValueCommit={() => commitRetime({ rate: pendingRateRef.current, maintainPitch })}
							aria-label="Speed"
							data-speed-slider
						/>
					</SectionField>
					<SectionField label="Duration">
						<div className="flex items-center gap-2">
							<input
								type="number"
								min={0.1}
								step={0.1}
								key={`${element.id}:${element.duration}`}
								defaultValue={(element.duration / TICKS_PER_SECOND).toFixed(1)}
								data-speed-duration
								onKeyDown={(e) => {
									if (e.key === "Enter") e.currentTarget.blur();
								}}
								onBlur={(e) => {
									const seconds = Number(e.currentTarget.value);
									if (!(seconds > 0)) return;
									const sourceSeconds =
										(element.duration / TICKS_PER_SECOND) * rate;
									commitRetime({
										rate: clampRetimeRate({ rate: sourceSeconds / seconds }),
										maintainPitch,
									});
								}}
								className="bg-background h-8 w-24 rounded-md border px-2 text-sm"
							/>
							<span className="text-muted-foreground text-xs">seconds</span>
						</div>
					</SectionField>
					<div className="flex items-center justify-between">
						<span className="text-sm font-semibold" title="On: the sound goes higher when sped up and lower when slowed down">
							Pitch
						</span>
						<Switch
							checked={!maintainPitch}
							disabled={!isPitchPreserveAvailable}
							onCheckedChange={(checked) =>
								commitRetime({ rate, maintainPitch: !checked })
							}
						/>
					</div>
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

const SLIDER_MIN = 0.1;
const SLIDER_MAX = 5;

function speedToSlider(rate: number): number {
	const clamped = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, rate));
	return Math.log(clamped / SLIDER_MIN) / Math.log(SLIDER_MAX / SLIDER_MIN);
}

function sliderToSpeed(value: number): number {
	const rate = SLIDER_MIN * (SLIDER_MAX / SLIDER_MIN) ** value;
	return Math.round(rate * 100) / 100;
}
