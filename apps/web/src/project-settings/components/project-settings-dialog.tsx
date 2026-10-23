"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BatchCommand } from "@/commands";
import { UpdateProjectSettingsCommand } from "@/commands/project/update-project-settings";
import { UpdateElementsCommand } from "@/commands/timeline/element/update-elements";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCloudSync } from "@/cloud/store";
import { useEditor } from "@/editor/use-editor";
import { EXPORT_PRESETS, evenSize } from "@/export/presets";
import { floatToFrameRate, frameRateToFloat } from "@/fps/utils";
import type { InputMode } from "@/input-method/store";
import type {
	TCanvasSize,
	TProjectColorSpace,
	TProjectDefaults,
	TProjectSettings,
} from "@/project/types";
import { hasMediaId, isVisualElement } from "@/timeline/element-utils";
import { LANGUAGES } from "@/transcription/languages";
import { cn } from "@/utils/ui";
import { useSphereStore } from "@/vr/store";
import { reflowElements, type ReflowMode } from "../reflow";
import { BUILT_IN_TEMPLATES, useProjectSettings } from "../store";

const ASPECTS: { id: string; label: string; ratio: [number, number] }[] = [
	{ id: "16:9", label: "16:9", ratio: [16, 9] },
	{ id: "9:16", label: "9:16", ratio: [9, 16] },
	{ id: "1:1", label: "1:1", ratio: [1, 1] },
	{ id: "4:5", label: "4:5", ratio: [4, 5] },
	{ id: "4:3", label: "4:3", ratio: [4, 3] },
	{ id: "21:9", label: "21:9", ratio: [21, 9] },
	{ id: "2:1", label: "2:1 (360°)", ratio: [2, 1] },
];
const LEVELS = [
	{ value: 720, label: "720p" },
	{ value: 1080, label: "1080p" },
	{ value: 1440, label: "2K" },
	{ value: 2160, label: "4K" },
	{ value: 4320, label: "8K" },
];
const RATES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
const COLOR_SPACES: { value: TProjectColorSpace; label: string; hdr: boolean }[] = [
	{ value: "rec709", label: "Rec. 709 SDR", hdr: false },
	{ value: "rec2020", label: "Rec. 2020 SDR", hdr: false },
	{ value: "hlg", label: "Rec. 2100 HLG (HDR)", hdr: true },
	{ value: "pq", label: "Rec. 2100 PQ / HDR10", hdr: true },
];
const INPUT_MODES: { value: InputMode | ""; label: string }[] = [
	{ value: "", label: "Keep my current choice" },
	{ value: "en", label: "English" },
	{ value: "si", label: "Sinhala (Singlish / Wijesekara)" },
	{ value: "ta", label: "Tamil" },
];

type Tab = "details" | "performance" | "defaults";

function sizeFor({ ratio, level }: { ratio: [number, number]; level: number }): TCanvasSize {
	const [w, h] = ratio;
	return evenSize(
		w >= h
			? { width: Math.round((level * w) / h), height: level }
			: { width: level, height: Math.round((level * h) / w) },
	);
}

function aspectOf(size: TCanvasSize): string {
	const r = size.width / size.height;
	return ASPECTS.find((a) => Math.abs(a.ratio[0] / a.ratio[1] - r) < 0.01)?.id ?? "custom";
}

function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="grid grid-cols-[150px_1fr] items-start gap-3 py-2">
			<span className="pt-1.5 text-sm">{label}</span>
			<div className="flex min-w-0 flex-col gap-1">
				{children}
				{hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
			</div>
		</div>
	);
}

const selectClass = "bg-accent/50 h-8 rounded-md border px-2 text-sm";

/** Project settings: Details, Performance and Defaults (SRS section 28). */
export function ProjectSettingsDialog() {
	const open = useProjectSettings((s) => s.open);
	const setOpen = useProjectSettings((s) => s.setOpen);
	const project = useEditor((e) => e.project.getActiveOrNull());
	if (!project) return null;
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{open ? (
				<ProjectSettingsBody key={project.metadata.id} onClose={() => setOpen(false)} />
			) : null}
		</Dialog>
	);
}

function ProjectSettingsBody({ onClose }: { onClose: () => void }) {
	const editor = useEditor();
	const project = editor.project.getActive();
	const settings = project.settings;
	const links = useCloudSync((s) => s.links);
	const sphere = useSphereStore((s) => !!s.sphereProjects[project.metadata.id]);
	const setSphere = useSphereStore((s) => s.setSphereProject);
	const templates = useProjectSettings((s) => s.templates);
	const saveTemplate = useProjectSettings((s) => s.saveTemplate);

	const [tab, setTab] = useState<Tab>("details");
	const [name, setName] = useState(project.metadata.name);
	const [size, setSize] = useState<TCanvasSize>(settings.canvasSize);
	const [fps, setFps] = useState(frameRateToFloat(settings.fps));
	const [colorSpace, setColorSpace] = useState<TProjectColorSpace>(
		settings.colorSpace ?? "rec709",
	);
	const [sampleRate, setSampleRate] = useState(settings.audio?.sampleRate ?? 48000);
	const [channels, setChannels] = useState(settings.audio?.channels ?? 2);
	const [is360, setIs360] = useState(sphere);
	const [reflow, setReflow] = useState<ReflowMode>("fit");
	const [defaults, setDefaults] = useState<TProjectDefaults>(settings.defaults ?? {});
	const [templateName, setTemplateName] = useState<string | null>(null);

	const tracks = editor.scenes.getActiveScene().tracks;
	const hasClips = [tracks.main, ...tracks.overlay].some((t) => t.elements.length > 0);
	const sizeChanged =
		size.width !== settings.canvasSize.width || size.height !== settings.canvasSize.height;
	const aspect = aspectOf(size);
	const shortSide = Math.min(size.width, size.height);
	const level = LEVELS.find((l) => l.value === shortSide)?.value ?? 0;

	const original = (() => {
		const assets = editor.media.getAssets();
		for (const track of [tracks.main, ...tracks.overlay])
			for (const element of track.elements) {
				if (!isVisualElement(element) || !hasMediaId(element)) continue;
				const asset = assets.find((a) => a.id === element.mediaId);
				if (asset?.width && asset.height)
					return evenSize({ width: asset.width, height: asset.height });
			}
		return null;
	})();

	const setAspect = (id: string) => {
		if (id === "original" && original) return setSize(original);
		const option = ASPECTS.find((a) => a.id === id);
		if (option) setSize(sizeFor({ ratio: option.ratio, level: level || shortSide || 1080 }));
	};
	const setLevel = (value: number) => {
		const option = ASPECTS.find((a) => a.id === aspect);
		const ratio: [number, number] = option?.ratio ?? [size.width, size.height];
		setSize(sizeFor({ ratio, level: value }));
	};
	const setDefault = (patch: Partial<TProjectDefaults>) =>
		setDefaults((d) => ({ ...d, ...patch }));

	const nextSettings = (): Partial<TProjectSettings> => ({
		canvasSize: size,
		canvasSizeMode: "custom",
		lastCustomCanvasSize: size,
		fps: fps === frameRateToFloat(settings.fps) ? settings.fps : floatToFrameRate(fps),
		colorSpace,
		audio: { sampleRate, channels },
		defaults,
	});

	const save = async () => {
		const settingsCommand = new UpdateProjectSettingsCommand(nextSettings());
		const patches = sizeChanged
			? reflowElements({
					tracks,
					assets: editor.media.getAssets(),
					from: settings.canvasSize,
					to: size,
					mode: reflow,
				})
			: [];
		// One undo step for everything (PS-25).
		editor.command.execute({
			command:
				patches.length > 0
					? new BatchCommand([settingsCommand, new UpdateElementsCommand({ updates: patches })])
					: settingsCommand,
		});
		if (is360 !== sphere) setSphere({ projectId: project.metadata.id, on: is360 });
		const trimmed = name.trim();
		if (trimmed && trimmed !== project.metadata.name)
			await editor.project
				.renameProject({ id: project.metadata.id, name: trimmed })
				.catch(() => toast.error("Couldn't rename the project"));
		toast.success("Project settings saved");
		onClose();
	};

	const applyTemplate = (id: string) => {
		const template = [...BUILT_IN_TEMPLATES, ...templates].find((t) => t.id === id);
		if (!template) return;
		const t = template.settings;
		if (t.canvasSize) setSize(t.canvasSize);
		if (t.fps) setFps(frameRateToFloat(t.fps));
		if (t.colorSpace) setColorSpace(t.colorSpace);
		if (t.audio) {
			setSampleRate(t.audio.sampleRate);
			setChannels(t.audio.channels);
		}
		if (t.defaults) setDefaults(t.defaults);
	};

	return (
		<DialogContent className="max-w-2xl" data-project-settings>
			<DialogHeader>
				<DialogTitle>Project settings</DialogTitle>
			</DialogHeader>
			<div className="flex gap-4 border-b px-1" role="tablist">
				{(["details", "performance", "defaults"] as const).map((t) => (
					<button
						key={t}
						type="button"
						role="tab"
						aria-selected={tab === t}
						onClick={() => setTab(t)}
						data-settings-tab={t}
						className={cn(
							"-mb-px border-b-2 pb-1.5 text-sm font-medium capitalize",
							tab === t
								? "border-primary text-foreground"
								: "text-muted-foreground border-transparent",
						)}
					>
						{t}
					</button>
				))}
			</div>
			<div className="max-h-[60vh] min-h-[360px] overflow-y-auto px-1">
				{tab === "details" && (
					<>
						<Field label="Name">
							<Input value={name} onChange={(e) => setName(e.target.value)} />
						</Field>
						<Field
							label="Save to"
							hint={
								links[project.metadata.id]
									? "Also synced to Worksuite Cloud."
									: "Turn on cloud sync from the cloud button in the header."
							}
						>
							<span className="text-sm">This computer (app storage)</span>
						</Field>
						<Field
							label="Imported media"
							hint="Project folders with copied media come with decision D-6 (portable project folders)."
						>
							<select className={selectClass} disabled value="reference">
								<option value="reference">Keep in original location</option>
								<option value="copy">Copy media into project</option>
							</select>
						</Field>
						<Field label="Aspect ratio">
							<select
								className={selectClass}
								value={aspect}
								onChange={(e) => setAspect(e.target.value)}
								data-field="aspect"
							>
								{original && <option value="original">Original (first clip)</option>}
								{ASPECTS.map((a) => (
									<option key={a.id} value={a.id}>
										{a.label}
									</option>
								))}
								{aspect === "custom" && <option value="custom">Custom</option>}
							</select>
						</Field>
						<Field label="Resolution" hint={`${size.width} × ${size.height}`}>
							<div className="flex flex-wrap items-center gap-2">
								<select
									className={selectClass}
									value={level || "custom"}
									onChange={(e) => {
										const v = Number(e.target.value);
										if (v) setLevel(v);
									}}
									data-field="resolution"
								>
									{LEVELS.map((l) => (
										<option key={l.value} value={l.value}>
											{l.label}
										</option>
									))}
									<option value="custom">Custom</option>
								</select>
								<Input
									type="number"
									className="h-8 w-24"
									value={size.width}
									aria-label="Width"
									onChange={(e) =>
										setSize((s) => ({
											...s,
											width: Math.min(7680, Math.max(2, Number(e.target.value) || 2)),
										}))
									}
								/>
								<span className="text-muted-foreground text-xs">×</span>
								<Input
									type="number"
									className="h-8 w-24"
									value={size.height}
									aria-label="Height"
									onChange={(e) =>
										setSize((s) => ({
											...s,
											height: Math.min(4320, Math.max(2, Number(e.target.value) || 2)),
										}))
									}
								/>
							</div>
						</Field>
						<Field label="Frame rate" hint="Match most of your footage for the smoothest result.">
							<select
								className={selectClass}
								value={fps}
								onChange={(e) => setFps(Number(e.target.value))}
								data-field="fps"
							>
								{[...new Set([...RATES, frameRateToFloat(settings.fps)])]
									.sort((a, b) => a - b)
									.map((r) => (
										<option key={r} value={r}>
											{Number(r.toFixed(3))} fps
										</option>
									))}
							</select>
						</Field>
						<Field
							label="Color space"
							hint="HDR (HLG and PQ) needs the HDR pipeline in section 24, which isn't built yet."
						>
							<select
								className={selectClass}
								value={colorSpace}
								onChange={(e) => {
									const next = COLOR_SPACES.find((c) => c.value === e.target.value);
									if (next && !next.hdr) setColorSpace(next.value);
								}}
							>
								{COLOR_SPACES.map((c) => (
									<option key={c.value} value={c.value} disabled={c.hdr}>
										{c.label}
									</option>
								))}
							</select>
						</Field>
						<Field label="Arrange layers" hint="Free tracks (all tracks equal) is coming later.">
							<select className={selectClass} value="main" disabled>
								<option value="main">Main track (magnetic), others as overlays</option>
								<option value="free">Free tracks</option>
							</select>
						</Field>
						<Field label="Audio" hint="Used for export.">
							<div className="flex gap-2">
								<select
									className={selectClass}
									value={sampleRate}
									onChange={(e) => setSampleRate(Number(e.target.value) === 44100 ? 44100 : 48000)}
								>
									<option value={48000}>48 kHz</option>
									<option value={44100}>44.1 kHz</option>
								</select>
								<select
									className={selectClass}
									value={channels}
									onChange={(e) => setChannels(Number(e.target.value) === 1 ? 1 : 2)}
								>
									<option value={2}>Stereo</option>
									<option value={1}>Mono</option>
								</select>
							</div>
						</Field>
						<Field label="360° project" hint="Equirectangular 2:1 output with 360° metadata.">
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={is360}
									onChange={(e) => {
										setIs360(e.target.checked);
										if (e.target.checked && aspect !== "2:1") setAspect("2:1");
									}}
								/>
								Make this a 360° project
							</label>
						</Field>
						{sizeChanged && hasClips && (
							<Field label="Existing clips" hint="How clips adapt to the new frame.">
								<div className="flex flex-wrap gap-1.5" data-field="reflow">
									{(
										[
											["fit", "Scale to fit"],
											["fill", "Scale to fill"],
											["keep", "Keep size"],
										] as const
									).map(([value, label]) => (
										<button
											key={value}
											type="button"
											onClick={() => setReflow(value)}
											className={cn(
												"rounded-md border px-2.5 py-1 text-xs",
												reflow === value ? "border-primary bg-primary/10" : "hover:bg-accent",
											)}
										>
											{label}
										</button>
									))}
								</div>
							</Field>
						)}
					</>
				)}
				{tab === "performance" && (
					<div className="text-muted-foreground flex flex-col gap-3 py-3 text-sm">
						<p>
							Playback uses the GPU compositor at full project size, and the
							browser&apos;s hardware video decoding is always on.
						</p>
						<p>
							Proxies, preview quality, render cache, GPU choice and background
							task priority (PS-12 – PS-16) need the native media helper and
							are not available yet.
						</p>
					</div>
				)}
				{tab === "defaults" && (
					<>
						<Field label="Still image length">
							<div className="flex items-center gap-2">
								<Input
									type="number"
									min={0.5}
									step={0.5}
									className="h-8 w-24"
									value={defaults.stillSeconds ?? 5}
									onChange={(e) => setDefault({ stillSeconds: Number(e.target.value) || 5 })}
									data-field="still"
								/>
								<span className="text-muted-foreground text-xs">seconds</span>
							</div>
						</Field>
						<Field label="Transition length">
							<div className="flex items-center gap-2">
								<Input
									type="number"
									min={0.1}
									step={0.1}
									className="h-8 w-24"
									value={defaults.transitionSeconds ?? 0.8}
									onChange={(e) =>
										setDefault({ transitionSeconds: Number(e.target.value) || 0.8 })
									}
								/>
								<span className="text-muted-foreground text-xs">seconds</span>
							</div>
						</Field>
						<Field label="Caption language">
							<select
								className={selectClass}
								value={defaults.captionLanguage ?? "auto"}
								onChange={(e) => setDefault({ captionLanguage: e.target.value })}
							>
								<option value="auto">Detect automatically</option>
								{LANGUAGES.map((l) => (
									<option key={l.code} value={l.code}>
										{l.name}
									</option>
								))}
							</select>
						</Field>
						<Field label="Typing language" hint="Switched on when this project opens.">
							<select
								className={selectClass}
								value={defaults.inputMode ?? ""}
								onChange={(e) => {
									const mode = INPUT_MODES.find((m) => m.value === e.target.value);
									setDefault({ inputMode: mode?.value || undefined });
								}}
							>
								{INPUT_MODES.map((m) => (
									<option key={m.value} value={m.value}>
										{m.label}
									</option>
								))}
							</select>
						</Field>
						<Field label="Export preset">
							<select
								className={selectClass}
								value={defaults.exportPreset ?? "project"}
								onChange={(e) => setDefault({ exportPreset: e.target.value })}
							>
								<option value="project">Project size</option>
								{EXPORT_PRESETS.map((p) => (
									<option key={p.id} value={p.id}>
										{p.label}
									</option>
								))}
							</select>
						</Field>
						<Field label="Autosave" hint="Every change is saved within a second.">
							<span className="text-sm">Always on</span>
						</Field>
					</>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-2 border-t pt-3">
				<select
					className={selectClass}
					value=""
					onChange={(e) => applyTemplate(e.target.value)}
					aria-label="Apply a settings template"
				>
					<option value="">Apply template…</option>
					{[...BUILT_IN_TEMPLATES, ...templates].map((t) => (
						<option key={t.id} value={t.id}>
							{t.name}
						</option>
					))}
				</select>
				{templateName === null ? (
					<Button variant="ghost" size="sm" onClick={() => setTemplateName(`${size.width}×${size.height} ${fps} fps`)}>
						Save as template
					</Button>
				) : (
					<form
						className="flex items-center gap-1"
						onSubmit={(e) => {
							e.preventDefault();
							if (!templateName.trim()) return;
							const { background: _background, ...rest } = { ...settings, ...nextSettings() };
							saveTemplate({ name: templateName.trim(), settings: rest });
							setTemplateName(null);
							toast.success("Template saved");
						}}
					>
						<Input
							className="h-8 w-44"
							value={templateName}
							aria-label="Template name"
							onChange={(e) => setTemplateName(e.target.value)}
						/>
						<Button size="sm" type="submit">
							Save
						</Button>
					</form>
				)}
				<div className="flex-1" />
				<Button variant="outline" onClick={onClose}>
					Cancel
				</Button>
				<Button onClick={() => void save()} data-save-settings>
					Save
				</Button>
			</div>
		</DialogContent>
	);
}
