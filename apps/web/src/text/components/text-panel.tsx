"use client";

import { useState } from "react";
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Ban,
	Bold,
	CaseSensitive,
	Italic,
	ListOrdered,
	MoreHorizontal,
	Underline,
} from "lucide-react";
import { ElementParamsTab } from "@/components/editor/panels/properties/components/element-params-tab";
import { FontPicker } from "@/components/ui/font-picker";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/editor/use-editor";
import { loadFonts } from "@/fonts/google-fonts";
import type { ParamValues } from "@/params";
import type { TextElement } from "@/timeline";
import { cn } from "@/utils/ui";
import { presetPreviewStyle, TEXT_STYLE_PRESETS } from "../style-presets";
import { TEMPLATE_STYLE_KEYS, TEXT_TEMPLATES } from "../templates";

const FONT_SIZES = [6, 8, 10, 12, 15, 18, 22, 28, 36, 48, 64];
const TRANSFORM_KEYS = [
	"transform.positionX",
	"transform.positionY",
	"transform.scaleX",
	"transform.scaleY",
	"transform.rotate",
] as const;

type Write = (patch: ParamValues) => void;

/**
 * Writers for the selected text: `style` also reaches every other text clip
 * when "Apply to all" is on; `text` changes only this clip (its words).
 */
function useTextWriter({
	element,
	trackId,
	applyAll,
}: {
	element: TextElement;
	trackId: string;
	applyAll: boolean;
}): { style: Write; text: Write } {
	const editor = useEditor();
	const update = ({
		patch,
		everywhere,
	}: {
		patch: ParamValues;
		everywhere: boolean;
	}) => {
		const updates = [
			{
				trackId,
				elementId: element.id,
				patch: { params: { ...element.params, ...patch } },
			},
		];
		if (everywhere) {
			const tracks = editor.scenes.getActiveScene().tracks;
			for (const track of [...tracks.overlay, tracks.main]) {
				for (const other of track.elements) {
					if (other.type !== "text" || other.id === element.id) continue;
					updates.push({
						trackId: track.id,
						elementId: other.id,
						patch: { params: { ...other.params, ...patch } },
					});
				}
			}
		}
		editor.timeline.updateElements({ updates });
	};
	return {
		style: (patch) => update({ patch, everywhere: applyAll }),
		text: (patch) => update({ patch, everywhere: false }),
	};
}

function Section({
	title,
	children,
	action,
}: {
	title: string;
	children: React.ReactNode;
	action?: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3 border-b px-4 py-4">
			<div className="flex items-center justify-between">
				<h3 className="m-0 text-sm font-semibold">{title}</h3>
				{action}
			</div>
			{children}
		</section>
	);
}

function ToolButton({
	label,
	active,
	onClick,
	children,
}: {
	label: string;
	active?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"flex size-8 items-center justify-center rounded-md",
				active
					? "bg-secondary text-foreground"
					: "text-muted-foreground hover:bg-accent hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

function SliderRow({
	label,
	value,
	min,
	max,
	step = 1,
	onCommit,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	onCommit: (value: number) => void;
}) {
	const [draft, setDraft] = useState<number | null>(null);
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex justify-between text-xs">
				<span className="text-muted-foreground">{label}</span>
				<span className="tabular-nums">
					{Math.round((draft ?? value) * 100) / 100}
				</span>
			</div>
			<Slider
				value={[draft ?? value]}
				min={min}
				max={max}
				step={step}
				onValueChange={([v]) => setDraft(v ?? value)}
				onValueCommit={([v]) => {
					setDraft(null);
					onCommit(v ?? value);
				}}
			/>
		</div>
	);
}

function Swatch({
	color,
	enabled,
	onPick,
	label,
}: {
	color: string;
	enabled: boolean;
	onPick: (color: string) => void;
	label: string;
}) {
	return (
		<label
			className={cn(
				"relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-md border",
				!enabled && "bg-muted",
			)}
			title={label}
			style={enabled ? { background: color } : undefined}
		>
			{!enabled && (
				<span className="bg-muted-foreground/60 absolute h-px w-10 rotate-45" />
			)}
			<input
				type="color"
				className="absolute inset-0 cursor-pointer opacity-0"
				value={color.slice(0, 7)}
				onChange={(e) => onPick(e.target.value)}
				aria-label={label}
			/>
		</label>
	);
}

function StyleRow({
	label,
	enabledKey,
	colorKey,
	params,
	write,
	details,
}: {
	label: string;
	enabledKey?: string;
	colorKey: string;
	params: ParamValues;
	write: Write;
	details?: React.ReactNode;
}) {
	const enabled = enabledKey ? !!params[enabledKey] : true;
	const color = String(params[colorKey] ?? "#ffffff");
	return (
		<div
			className="flex items-center justify-between"
			data-text-style={label.toLowerCase()}
		>
			<span className={cn("text-sm", !enabled && "text-muted-foreground")}>
				{label}
			</span>
			<div className="flex items-center gap-2">
				{enabledKey && (
					<Switch
						checked={enabled}
						onCheckedChange={(on) => write({ [enabledKey]: on })}
						aria-label={`${label} on`}
					/>
				)}
				<Swatch
					color={color}
					enabled={enabled}
					label={`${label} colour`}
					onPick={(c) =>
						write({
							[colorKey]: c,
							...(enabledKey ? { [enabledKey]: true } : {}),
						})
					}
				/>
				{details ? (
					<Popover>
						<PopoverTrigger asChild>
							<button
								type="button"
								aria-label={`${label} settings`}
								className="text-muted-foreground hover:text-foreground flex size-8 items-center justify-center"
							>
								<MoreHorizontal className="size-4" />
							</button>
						</PopoverTrigger>
						<PopoverContent align="end" className="flex w-60 flex-col gap-3">
							{details}
						</PopoverContent>
					</Popover>
				) : (
					<span className="size-8" />
				)}
			</div>
		</div>
	);
}

const CASES = ["none", "upper", "lower", "title"] as const;

function changeCase({
	text,
	to,
}: {
	text: string;
	to: (typeof CASES)[number];
}) {
	if (to === "upper") return text.toLocaleUpperCase();
	if (to === "lower") return text.toLocaleLowerCase();
	if (to === "title")
		return text
			.toLocaleLowerCase()
			.replace(
				/(^|\s)(\p{L})/gu,
				(_, a: string, b: string) => a + b.toLocaleUpperCase(),
			);
	return text;
}

/** Text › Basic: words, font, format bar, style, glow, opacity, transform. */
export function TextBasicTab({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const [applyAll, setApplyAll] = useState(false);
	const { style: write, text: writeText } = useTextWriter({
		element,
		trackId,
		applyAll,
	});
	const p = element.params;
	const [draft, setDraft] = useState<string | null>(null);
	const content = String(p.content ?? "");
	const caseIndex = Number(p["text.case"] ?? 0) || 0;
	const align = String(p.textAlign ?? "center");

	return (
		<div className="flex min-h-full flex-col" data-text-basic>
			<div className="px-4 pt-4">
				<textarea
					value={draft ?? content}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={() => {
						if (draft !== null && draft !== content)
							writeText({ content: draft });
						setDraft(null);
					}}
					rows={3}
					className="bg-accent/50 w-full resize-y rounded-lg border-0 p-3 text-sm"
					style={{
						fontFamily: `"${String(p.fontFamily ?? "Inter")}", 'Noto Sans Sinhala', sans-serif`,
					}}
					aria-label="Text"
					data-text-content
				/>
			</div>
			<Section title="Font">
				<FontPicker
					defaultValue={String(p.fontFamily ?? "Inter")}
					onValueChange={(font) => {
						void loadFonts({ families: [font] }).catch(() => {});
						write({ fontFamily: font });
					}}
				/>
			</Section>
			<Section title="Format">
				<div className="flex flex-wrap items-center gap-1">
					<select
						className="bg-accent/50 h-8 rounded-md border-0 px-2 text-sm"
						value={String(p.fontSize ?? 15)}
						onChange={(e) => write({ fontSize: Number(e.target.value) })}
						aria-label="Font size"
					>
						{[...new Set([...FONT_SIZES, Number(p.fontSize ?? 15)])]
							.sort((a, b) => a - b)
							.map((size) => (
								<option key={size} value={size}>
									{size}
								</option>
							))}
					</select>
					<ToolButton
						label="Bold"
						active={p.fontWeight === "bold"}
						onClick={() =>
							write({ fontWeight: p.fontWeight === "bold" ? "normal" : "bold" })
						}
					>
						<Bold className="size-4" />
					</ToolButton>
					<ToolButton
						label="Italic"
						active={p.fontStyle === "italic"}
						onClick={() =>
							write({
								fontStyle: p.fontStyle === "italic" ? "normal" : "italic",
							})
						}
					>
						<Italic className="size-4" />
					</ToolButton>
					<ToolButton
						label="Underline"
						active={p.textDecoration === "underline"}
						onClick={() =>
							write({
								textDecoration:
									p.textDecoration === "underline" ? "none" : "underline",
							})
						}
					>
						<Underline className="size-4" />
					</ToolButton>
					<ToolButton
						label={`Align ${align}`}
						onClick={() =>
							write({
								textAlign:
									align === "left"
										? "center"
										: align === "center"
											? "right"
											: "left",
							})
						}
					>
						{align === "left" ? (
							<AlignLeft className="size-4" />
						) : align === "right" ? (
							<AlignRight className="size-4" />
						) : (
							<AlignCenter className="size-4" />
						)}
					</ToolButton>
					<ToolButton
						label="Change case (Aa, AA, aa, Title)"
						active={caseIndex > 0}
						onClick={() => {
							const next = (caseIndex + 1) % CASES.length;
							const to = CASES[next] ?? "none";
							writeText({
								"text.case": next,
								...(to === "none"
									? {}
									: { content: changeCase({ text: content, to }) }),
							});
						}}
					>
						<CaseSensitive className="size-4" />
					</ToolButton>
					<Popover>
						<PopoverTrigger asChild>
							<button
								type="button"
								aria-label="Spacing"
								title="Line and letter spacing"
								className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-8 items-center justify-center rounded-md"
							>
								<ListOrdered className="size-4" />
							</button>
						</PopoverTrigger>
						<PopoverContent className="flex w-60 flex-col gap-3">
							<SliderRow
								label="Line spacing"
								value={Number(p.lineHeight ?? 1.2)}
								min={0.6}
								max={3}
								step={0.05}
								onCommit={(v) => write({ lineHeight: v })}
							/>
							<SliderRow
								label="Letter spacing"
								value={Number(p.letterSpacing ?? 0)}
								min={-10}
								max={40}
								step={0.5}
								onCommit={(v) => write({ letterSpacing: v })}
							/>
						</PopoverContent>
					</Popover>
				</div>
			</Section>
			<Section
				title="Style"
				action={
					<button
						type="button"
						className="text-muted-foreground hover:text-foreground text-xs"
						onClick={() =>
							write({
								"stroke.enabled": false,
								"background.enabled": false,
								"shadow.enabled": false,
								color: "#ffffff",
							})
						}
					>
						Reset
					</button>
				}
			>
				<StyleRow label="Fill" colorKey="color" params={p} write={write} />
				<StyleRow
					label="Stroke"
					enabledKey="stroke.enabled"
					colorKey="stroke.color"
					params={p}
					write={write}
					details={
						<SliderRow
							label="Width"
							value={Number(p["stroke.width"] ?? 6)}
							min={0}
							max={40}
							onCommit={(v) =>
								write({ "stroke.width": v, "stroke.enabled": true })
							}
						/>
					}
				/>
				<StyleRow
					label="Background"
					enabledKey="background.enabled"
					colorKey="background.color"
					params={p}
					write={write}
					details={
						<>
							<SliderRow
								label="Rounded corners"
								value={Number(p["background.cornerRadius"] ?? 0)}
								min={0}
								max={60}
								onCommit={(v) => write({ "background.cornerRadius": v })}
							/>
							<SliderRow
								label="Padding"
								value={Number(p["background.paddingX"] ?? 16)}
								min={0}
								max={80}
								onCommit={(v) =>
									write({
										"background.paddingX": v,
										"background.paddingY": Math.round(v / 2),
									})
								}
							/>
						</>
					}
				/>
				<StyleRow
					label="Shadow"
					enabledKey="shadow.enabled"
					colorKey="shadow.color"
					params={p}
					write={write}
					details={
						<>
							<SliderRow
								label="Blur"
								value={Number(p["shadow.blur"] ?? 10)}
								min={0}
								max={100}
								onCommit={(v) =>
									write({ "shadow.blur": v, "shadow.enabled": true })
								}
							/>
							<SliderRow
								label="Distance"
								value={Number(p["shadow.offsetY"] ?? 6)}
								min={-50}
								max={50}
								onCommit={(v) =>
									write({ "shadow.offsetY": v, "shadow.enabled": true })
								}
							/>
						</>
					}
				/>
			</Section>
			<Section
				title="Glow"
				action={
					<Switch
						checked={!!p["glow.enabled"]}
						onCheckedChange={(on) => write({ "glow.enabled": on })}
						aria-label="Glow"
						data-text-glow
					/>
				}
			>
				{!!p["glow.enabled"] && (
					<div className="flex items-end gap-3">
						<Swatch
							color={String(p["glow.color"] ?? "#2EC4FF")}
							enabled
							label="Glow colour"
							onPick={(c) => write({ "glow.color": c })}
						/>
						<div className="flex-1">
							<SliderRow
								label="Size"
								value={Number(p["glow.size"] ?? 30)}
								min={0}
								max={100}
								onCommit={(v) => write({ "glow.size": v })}
							/>
						</div>
					</div>
				)}
			</Section>
			<Section title="Opacity">
				<SliderRow
					label="Opacity"
					value={Math.round(Number(p.opacity ?? 1) * 100)}
					min={0}
					max={100}
					onCommit={(v) => write({ opacity: v / 100 })}
				/>
			</Section>
			<ElementParamsTab
				element={element}
				trackId={trackId}
				paramKeys={TRANSFORM_KEYS}
				sectionKey="text-transform"
			/>
			<label className="bg-background sticky bottom-0 mt-auto flex items-center gap-2 border-t px-4 py-3 text-sm">
				<input
					type="checkbox"
					checked={applyAll}
					onChange={(e) => setApplyAll(e.target.checked)}
					data-apply-all
				/>
				Apply to all text
			</label>
		</div>
	);
}

const NO_STYLE: ParamValues = {
	"stroke.enabled": false,
	"shadow.enabled": false,
	"glow.enabled": false,
	"background.enabled": false,
	color: "#FFFFFF",
};

/** Text › Presets: Styles (looks) and Templates (look + layout). */
export function TextPresetsTab({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const [tab, setTab] = useState<"styles" | "templates">("styles");
	const [applyAll, setApplyAll] = useState(false);
	const { style: write } = useTextWriter({ element, trackId, applyAll });
	const keys = new Set(TEMPLATE_STYLE_KEYS);

	return (
		<div className="flex min-h-full flex-col gap-3 p-4" data-text-presets>
			<div className="bg-accent/60 grid grid-cols-2 gap-1 rounded-xl p-1">
				{(
					[
						["styles", "Styles"],
						["templates", "Templates"],
					] as const
				).map(([value, label]) => (
					<button
						key={value}
						type="button"
						onClick={() => setTab(value)}
						className={cn(
							"rounded-lg py-1.5 text-sm",
							tab === value
								? "bg-background font-semibold shadow-sm"
								: "text-muted-foreground",
						)}
					>
						{label}
					</button>
				))}
			</div>
			<div className="grid grid-cols-3 gap-2">
				<button
					type="button"
					title="No style"
					onClick={() => write(NO_STYLE)}
					className="bg-accent/40 flex aspect-square items-center justify-center rounded-lg border"
				>
					<Ban className="text-muted-foreground size-6" />
				</button>
				{tab === "styles"
					? TEXT_STYLE_PRESETS.map((preset) => (
							<button
								key={preset.id}
								type="button"
								title={preset.name}
								data-text-style-preset={preset.id}
								onClick={() => write(preset.params)}
								className="bg-accent/40 hover:bg-accent flex aspect-square items-center justify-center rounded-lg text-base font-bold"
							>
								<span style={presetPreviewStyle(preset.params)}>BROWN</span>
							</button>
						))
					: TEXT_TEMPLATES.map((template) => (
							<button
								key={template.id}
								type="button"
								title={template.name}
								data-text-template={template.id}
								onClick={() => {
									const families = [
										String(template.params.fontFamily ?? ""),
									].filter(Boolean);
									void loadFonts({ families }).catch(() => {});
									write(
										Object.fromEntries(
											Object.entries(template.params).filter(
												([k]) => keys.has(k) || k.startsWith("animation."),
											),
										),
									);
								}}
								className="bg-accent/40 hover:bg-accent flex aspect-square items-center justify-center overflow-hidden rounded-lg px-1 text-center text-[11px] leading-tight"
							>
								<span
									style={{
										...presetPreviewStyle(template.params),
										fontFamily: `"${String(template.params.fontFamily ?? "Inter")}", sans-serif`,
									}}
								>
									{template.name}
								</span>
							</button>
						))}
			</div>
			<label className="mt-auto flex items-center gap-2 border-t pt-3 text-sm">
				<input
					type="checkbox"
					checked={applyAll}
					onChange={(e) => setApplyAll(e.target.checked)}
				/>
				Apply to all text
			</label>
		</div>
	);
}
