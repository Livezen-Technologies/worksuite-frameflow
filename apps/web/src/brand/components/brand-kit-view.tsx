"use client";

import { useT } from "@/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus, Stamp, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { FontPicker } from "@/components/ui/font-picker";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import { kitData, setOwnKit, switchBrandKit, useProjectKits } from "../project-kits";
import { parseBrandKit, usePackItems, type PackBrandKit } from "@/asset-library/pack-items";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { generateUUID } from "@/utils/id";
import { cn } from "@/utils/ui";
import {
	addBrandText,
	addLogoWatermark,
	applyBrandToSelection,
	type BrandTextKind,
} from "../actions";
import {
	MAX_LOGO_BYTES,
	MAX_LOGOS,
	useBrandKit,
	type WatermarkCorner,
} from "../store";

const CORNERS: { value: WatermarkCorner; label: string }[] = [
	{ value: "top-left", label: "↖" },
	{ value: "top-right", label: "↗" },
	{ value: "bottom-left", label: "↙" },
	{ value: "bottom-right", label: "↘" },
];

function Section({
	title,
	action,
	children,
}: {
	title: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2 border-b pb-4 last:border-b-0">
			<div className="flex items-center justify-between">
				<h3 className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
					{title}
				</h3>
				{action}
			</div>
			{children}
		</section>
	);
}

function readAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

/** Brand kit: logos, colours and fonts, one click from the timeline. */
export function BrandKitView() {
	const editor = useEditor();
	const kit = useBrandKit();
	const { selectedElements } = useElementSelection();
	const fileRef = useRef<HTMLInputElement>(null);
	const colorRef = useRef<HTMLInputElement>(null);
	const [selectedLogo, setSelectedLogo] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const targets = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.map(({ track, element }) => ({ trackId: track.id, element }));
	const logo =
		kit.logos.find((l) => l.id === selectedLogo) ?? kit.logos[0] ?? null;

	const onLogoFiles = async (files: FileList | null) => {
		for (const file of Array.from(files ?? [])) {
			if (!file.type.startsWith("image/")) continue;
			if (file.size > MAX_LOGO_BYTES) {
				toast.error(`${file.name} is over 1 MB. Use a smaller PNG or SVG.`);
				continue;
			}
			const id = generateUUID();
			kit.addLogo({ id, name: file.name, dataUrl: await readAsDataUrl(file) });
			setSelectedLogo(id);
		}
	};

	const applyColor = async (color: string) => {
		if (targets.length === 0) {
			await navigator.clipboard?.writeText(color).catch(() => {});
			toast.success(`Copied ${color}. Select text or shapes to colour them.`);
			return;
		}
		const count = await applyBrandToSelection({ editor, targets, kit, color });
		if (count === 0) toast.info("Brand colours apply to text and shapes.");
	};

	return (
		<PanelView title="Brand kit">
			<div className="flex flex-col gap-4" data-brand-kit>
				<Input
					value={kit.name}
					onChange={(e) => kit.setName(e.target.value)}
					className="h-8 font-semibold"
					aria-label="Brand name"
				/>
				<ProjectKitSwitch />
				<DownloadedBrandKits />

				<Section
					title="Logos"
					action={
						kit.logos.length < MAX_LOGOS && (
							<Button
								size="sm"
								variant="outline"
								className="h-6 px-2 text-[11px]"
								onClick={() => fileRef.current?.click()}
							>
								<Plus className="size-3" /> Upload
							</Button>
						)
					}
				>
					<input
						ref={fileRef}
						type="file"
						accept="image/png,image/svg+xml,image/webp,image/jpeg"
						multiple
						className="hidden"
						data-brand-logo-input
						onChange={(e) => {
							void onLogoFiles(e.target.files);
							e.target.value = "";
						}}
					/>
					{kit.logos.length === 0 ? (
						<button
							type="button"
							onClick={() => fileRef.current?.click()}
							className="text-muted-foreground hover:bg-accent/40 rounded-xl border border-dashed p-4 text-xs"
						>
							Upload your logo (PNG with transparency works best)
						</button>
					) : (
						<>
							<div className="grid grid-cols-3 gap-2">
								{kit.logos.map((l) => (
									<div key={l.id} className="group relative">
										<button
											type="button"
											onClick={() => setSelectedLogo(l.id)}
											className={cn(
												"flex aspect-square w-full items-center justify-center rounded-xl bg-[repeating-conic-gradient(#1a1d24_0%_25%,#14171d_0%_50%)] bg-[length:14px_14px] p-2",
												logo?.id === l.id
													? "ring-2 ring-[#22D3EE]"
													: "ring-1 ring-white/5",
											)}
										>
											{/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
											<img
												src={l.dataUrl}
												alt={l.name}
												className="max-h-full max-w-full object-contain"
											/>
										</button>
										<button
											type="button"
											aria-label={`Remove ${l.name}`}
											onClick={() => kit.removeLogo(l.id)}
											className="bg-background absolute -top-1.5 -right-1.5 hidden rounded-full border p-0.5 group-hover:block"
										>
											<X className="size-3" />
										</button>
									</div>
								))}
							</div>
							<div
								className="flex flex-col gap-2 rounded-xl border p-3"
								data-watermark
							>
								<div className="flex items-center justify-between text-xs">
									<span>Corner</span>
									<div className="flex gap-1">
										{CORNERS.map((c) => (
											<button
												key={c.value}
												type="button"
												aria-label={c.value}
												onClick={() => kit.setWatermark({ corner: c.value })}
												className={cn(
													"size-7 rounded-md border text-sm",
													kit.watermark.corner === c.value
														? "bg-primary text-primary-foreground border-primary"
														: "hover:bg-accent",
												)}
											>
												{c.label}
											</button>
										))}
									</div>
								</div>
								<div className="flex items-center justify-between text-xs">
									<span>Size</span>
									<span className="tabular-nums">{kit.watermark.size}%</span>
								</div>
								<Slider
									value={[kit.watermark.size]}
									min={4}
									max={40}
									step={1}
									onValueChange={([v]) => kit.setWatermark({ size: v })}
								/>
								<div className="flex items-center justify-between text-xs">
									<span>Opacity</span>
									<span className="tabular-nums">{kit.watermark.opacity}%</span>
								</div>
								<Slider
									value={[kit.watermark.opacity]}
									min={10}
									max={100}
									step={5}
									onValueChange={([v]) => kit.setWatermark({ opacity: v })}
								/>
								<Button
									size="sm"
									disabled={!logo || busy}
									onClick={async () => {
										if (!logo) return;
										setBusy(true);
										try {
											await addLogoWatermark({ editor, logo, kit });
											toast.success("Logo added for the whole video");
										} catch (e) {
											toast.error(
												e instanceof Error
													? e.message
													: "Couldn't add the logo",
											);
										} finally {
											setBusy(false);
										}
									}}
								>
									<Stamp /> Add logo watermark
								</Button>
							</div>
						</>
					)}
				</Section>

				<Section
					title="Colours"
					action={
						<Button
							size="sm"
							variant="outline"
							className="h-6 px-2 text-[11px]"
							onClick={() => colorRef.current?.click()}
						>
							<Plus className="size-3" /> Add
						</Button>
					}
				>
					<input
						ref={colorRef}
						type="color"
						className="sr-only"
						onChange={(e) => kit.addColor(e.target.value.toUpperCase())}
						aria-label="Add brand colour"
					/>
					<div className="flex flex-wrap gap-2">
						{kit.colors.map((color) => (
							<div key={color} className="group relative">
								<button
									type="button"
									title={
										targets.length > 0
											? `Apply ${color} to the selection`
											: `Copy ${color}`
									}
									onClick={() => void applyColor(color)}
									data-brand-color={color}
									className="size-9 rounded-lg ring-1 ring-white/15 transition hover:scale-105"
									style={{ background: color }}
								/>
								<button
									type="button"
									aria-label={`Remove ${color}`}
									onClick={() => kit.removeColor(color)}
									className="bg-background absolute -top-1.5 -right-1.5 hidden rounded-full border p-0.5 group-hover:block"
								>
									<Trash2 className="size-2.5" />
								</button>
							</div>
						))}
					</div>
				</Section>

				<Section title="Fonts">
					<div className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs">
						<span className="text-muted-foreground">Heading</span>
						<FontPicker
							defaultValue={kit.headingFont}
							onValueChange={(font) => kit.setFonts({ headingFont: font })}
						/>
						<span className="text-muted-foreground">Body</span>
						<FontPicker
							defaultValue={kit.bodyFont}
							onValueChange={(font) => kit.setFonts({ bodyFont: font })}
						/>
					</div>
				</Section>

				<Section title="Add in your brand">
					<div className="grid grid-cols-3 gap-2">
						{(
							[
								{
									kind: "heading",
									label: "Heading",
									sample: "Aa",
									font: kit.headingFont,
								},
								{
									kind: "body",
									label: "Body",
									sample: "Aa",
									font: kit.bodyFont,
								},
								{
									kind: "lower-third",
									label: "Lower third",
									sample: "▭",
									font: kit.headingFont,
								},
							] satisfies {
								kind: BrandTextKind;
								label: string;
								sample: string;
								font: string;
							}[]
						).map((item) => (
							<button
								key={item.kind}
								type="button"
								data-brand-text={item.kind}
								onClick={() =>
									void addBrandText({ editor, kit, kind: item.kind })
								}
								className="hover:bg-accent/40 flex flex-col items-center gap-1 rounded-xl border p-2"
							>
								<span
									className="flex h-10 w-full items-center justify-center rounded-md text-lg font-bold text-white"
									style={{
										background: kit.colors[0] ?? "#4C8DFF",
										fontFamily: `"${item.font}", sans-serif`,
									}}
								>
									{item.sample}
								</span>
								<span className="text-[11px]">{item.label}</span>
							</button>
						))}
					</div>
					<Button
						size="sm"
						variant="outline"
						disabled={targets.length === 0}
						onClick={async () => {
							const count = await applyBrandToSelection({
								editor,
								targets,
								kit,
							});
							toast.success(
								count > 0
									? `Brand fonts applied to ${count} clip${count === 1 ? "" : "s"}`
									: "Select text clips to apply brand fonts",
							);
						}}
					>
						<Wand2 /> Apply brand fonts to selection
					</Button>
				</Section>
			</div>
		</PanelView>
	);
}

/** This project's own kit, or the kit shared by every project (PS-20). */
function ProjectKitSwitch() {
	const projectId = useEditor((e) => e.project.getActiveOrNull()?.metadata.id ?? null);
	const own = useProjectKits((s) => (projectId ? !!s.byProject[projectId] : false));
	useEffect(() => {
		switchBrandKit({ projectId });
	}, [projectId]);
	if (!projectId) return null;
	return (
		<label className="flex items-center gap-2 text-xs" data-project-kit>
			<input type="checkbox" checked={own} onChange={(e) => setOwnKit({ projectId, own: e.target.checked })} />
			Separate brand kit for this project
			<span className="text-muted-foreground">({own ? "only this project" : "shared by all projects"})</span>
		</label>
	);
}

/** Brand kits installed from the Asset Library: "Use" loads one into this kit (with undo). */
function DownloadedBrandKits() {
	const kits = usePackItems({ types: ["brand-kits"], parse: parseBrandKit });
	const [busy, setBusy] = useState<string | null>(null);
	const t = useT();
	if (kits.length === 0) return null;

	const use = async (pack: PackBrandKit) => {
		setBusy(pack.id);
		try {
			const logos = [];
			for (const logo of pack.logos.slice(0, MAX_LOGOS)) {
				const res = await fetch(logo.url);
				if (!res.ok) continue;
				const blob = await res.blob();
				if (!blob.type.startsWith("image/") || blob.size > MAX_LOGO_BYTES) continue;
				logos.push({ id: generateUUID(), name: logo.name, dataUrl: await readAsDataUrl(new File([blob], logo.name, { type: blob.type })) });
			}
			const previous = kitData(useBrandKit.getState());
			useBrandKit.setState({
				name: pack.name,
				colors: pack.colors,
				...(pack.headingFont ? { headingFont: pack.headingFont } : {}),
				...(pack.bodyFont ? { bodyFont: pack.bodyFont } : {}),
				...(logos.length ? { logos } : {}),
			});
			toast.success(`Using the ${pack.name} brand kit`, {
				action: { label: "Undo", onClick: () => useBrandKit.setState(previous) },
			});
		} catch {
			toast.error(`Couldn't load the ${pack.name} brand kit`);
		} finally {
			setBusy(null);
		}
	};

	return (
		<Section title={t("Downloaded brand kits")}>
			<ul className="m-0 flex list-none flex-col gap-2 p-0" data-brand-downloads>
				{kits.map(({ value: pack }) => (
					<li key={pack.id} className="bg-card flex items-center gap-2 rounded-lg border p-2">
						<span className="flex shrink-0">
							{pack.colors.slice(0, 5).map((c) => (
								<span key={c} className="size-4 rounded-full ring-1 ring-black/20" style={{ background: c }} />
							))}
						</span>
						<span className="min-w-0 flex-1 truncate text-sm">{pack.name}</span>
						<Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={busy === pack.id} onClick={() => void use(pack)}>
							{t("Use")}
						</Button>
					</li>
				))}
			</ul>
		</Section>
	);
}
