"use client";

import { useMemo, useRef, useState } from "react";
import {
	Check,
	ChevronRight,
	ExternalLink,
	FolderOpen,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import type { TimelineElement, VisualElement } from "@/timeline";
import type { Effect } from "@/effects/types";
import { isVisualElement } from "@/timeline/element-utils";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { generateUUID } from "@/utils/id";
import { cn } from "@/utils/ui";
import { readCameraLut, withCameraLut, withCreativeLut } from "../apply";
import {
	CAMERA_MODELS,
	type CameraBrand,
	type CameraModel,
	cameraKey,
	officialLutUrl,
} from "../cameras";
import { useFootageCameras } from "../detect";
import { importLutFiles, removeLut, useLutLibrary } from "../library";

const BRANDS: CameraBrand[] = ["DJI", "GoPro", "Insta360"];

function mediaIdOf(element: TimelineElement): string | null {
	return "mediaId" in element && typeof element.mediaId === "string"
		? element.mediaId
		: null;
}

function openExternal(url: string) {
	window.open(url, "_blank", "noopener");
}

/** The Color workspace's LUTs section (SRS WS-11, WS-35–WS-48). */
export function LutSection() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	const { selectedElements } = useElementSelection();
	const library = useLutLibrary();
	const footage = useFootageCameras((s) => s.byMedia);
	const setCamera = useFootageCameras((s) => s.setCamera);
	const fileRef = useRef<HTMLInputElement>(null);
	const folderRef = useRef<HTMLInputElement>(null);
	const [openBrand, setOpenBrand] = useState<CameraBrand | null>("DJI");
	const [dragIntensity, setDragIntensity] = useState<number | null>(null);

	const targets = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.flatMap(({ track, element }) =>
			isVisualElement(element) ? [{ track, element }] : [],
		);
	const first = targets[0]?.element;
	const cameraLut = first ? readCameraLut(first.effects) : null;
	const cameraEntry =
		library.luts.find((l) => l.id === cameraLut?.lutId) ?? null;
	const firstMedia = first ? mediaIdOf(first) : null;
	const detected = firstMedia ? (footage[firstMedia] ?? null) : null;

	// Cameras found in this project's footage whose profile isn't known yet (WS-45).
	const questions = useMemo(() => {
		const seen = new Map<
			string,
			{ mediaIds: string[]; brand: CameraBrand; model?: string }
		>();
		for (const [mediaId, camera] of Object.entries(footage)) {
			if (!camera || camera.profile) continue;
			const key = cameraKey({
				brand: camera.brand,
				model: camera.model ?? camera.brand,
			});
			if (library.cameraProfiles[key]) continue;
			const entry = seen.get(key) ?? {
				mediaIds: [],
				brand: camera.brand,
				model: camera.model,
			};
			entry.mediaIds.push(mediaId);
			seen.set(key, entry);
		}
		return [...seen.entries()];
	}, [footage, library.cameraProfiles]);

	const write = ({
		updates,
	}: {
		updates: {
			trackId: string;
			element: VisualElement;
			effects: Effect[];
		}[];
	}) => {
		editor.timeline.updateElements({
			updates: updates.map(({ trackId, element, effects }) => ({
				trackId,
				elementId: element.id,
				patch: { effects },
			})),
		});
	};

	const applyCamera = ({
		lutId,
		scope,
		intensity = 100,
	}: {
		lutId: string | null;
		scope: "selection" | "camera";
		intensity?: number;
	}) => {
		let list: { trackId: string; element: VisualElement }[] = targets.map(
			({ track, element }) => ({
				trackId: track.id,
				element,
			}),
		);
		if (scope === "camera" && detected) {
			// Every clip on the timeline from the same camera (WS-38).
			const sameCamera = Object.entries(footage)
				.filter(
					([, c]) => c?.brand === detected.brand && c?.model === detected.model,
				)
				.map(([id]) => id);
			const tracks = editor.scenes.getActiveScene().tracks;
			list = [...tracks.overlay, tracks.main, ...tracks.audio].flatMap(
				(track) =>
					track.elements.flatMap((el) =>
						isVisualElement(el) && sameCamera.includes(mediaIdOf(el) ?? "")
							? [{ trackId: track.id, element: el }]
							: [],
					),
			);
		}
		if (list.length === 0) {
			toast.info("Select a video or photo clip first.");
			return;
		}
		write({
			updates: list.map(({ trackId, element }) => ({
				trackId,
				element,
				effects: withCameraLut({
					effects: element.effects,
					lutId,
					intensity,
					makeId: generateUUID,
				}),
			})),
		});
		if (scope === "camera")
			toast.success(
				`Updated ${list.length} clip${list.length === 1 ? "" : "s"} from this camera`,
			);
	};

	const applyCreative = (lutId: string) => {
		if (targets.length === 0) {
			toast.info("Select a video or photo clip first.");
			return;
		}
		write({
			updates: targets.map(({ track, element }) => ({
				trackId: track.id,
				element,
				effects: withCreativeLut({
					effects: element.effects,
					lutId,
					makeId: generateUUID,
				}),
			})),
		});
	};

	const onFiles = async (files: FileList | null) => {
		const list = Array.from(files ?? []);
		if (list.length === 0) return;
		const { added, failed } = await importLutFiles(list);
		if (added.length > 0) {
			const cameras = added.filter((l) => l.kind === "camera");
			toast.success(
				`Imported ${added.length} LUT${added.length === 1 ? "" : "s"}${
					cameras.length > 0 ? ` (${cameras.length} filed under cameras)` : ""
				}`,
			);
			const firstCamera = cameras[0];
			if (firstCamera?.brand) setOpenBrand(firstCamera.brand);
		}
		for (const f of failed.slice(0, 3)) toast.error(`${f.name}: ${f.reason}`);
		if (added.length === 0 && failed.length === 0)
			toast.info("No .cube files found.");
	};

	const lutFor = ({
		camera,
		profile,
	}: {
		camera: CameraModel;
		profile: string;
	}) =>
		library.luts.find(
			(l) =>
				l.kind === "camera" &&
				l.brand === camera.brand &&
				l.model === camera.model &&
				l.profile === profile,
		) ??
		library.luts.find(
			(l) =>
				l.kind === "camera" &&
				l.brand === camera.brand &&
				!l.model &&
				l.profile === profile,
		);

	const creative = library.luts.filter((l) => l.kind === "creative");
	const intensity = dragIntensity ?? cameraLut?.intensity ?? 100;

	return (
		<section
			className="flex flex-col gap-3 border-b px-1 pb-4"
			data-lut-section
		>
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold">LUTs</h3>
				<div className="flex gap-1">
					<Button
						size="sm"
						variant="outline"
						className="h-7 px-2 text-xs"
						onClick={() => fileRef.current?.click()}
					>
						<Upload className="size-3.5" /> Import .cube / ZIP
					</Button>
					<Button
						size="sm"
						variant="outline"
						className="h-7 px-2 text-xs"
						title="Import a folder of LUTs"
						onClick={() => folderRef.current?.click()}
					>
						<FolderOpen className="size-3.5" />
					</Button>
				</div>
			</div>
			<input
				ref={fileRef}
				type="file"
				multiple
				accept=".cube,.zip"
				className="hidden"
				data-lut-input
				onChange={(e) => {
					void onFiles(e.target.files);
					e.target.value = "";
				}}
			/>
			<input
				ref={folderRef}
				type="file"
				className="hidden"
				// @ts-expect-error -- non-standard but supported by Chromium/Electron
				webkitdirectory=""
				onChange={(e) => {
					void onFiles(e.target.files);
					e.target.value = "";
				}}
			/>

			{questions.map(([key, q]) => {
				const camera = CAMERA_MODELS.find(
					(c) => c.brand === q.brand && c.model === q.model,
				);
				const profiles =
					camera?.profiles ??
					(q.brand === "DJI"
						? ["D-Log", "D-Log M", "HLG", "Normal"]
						: ["Log", "Normal"]);
				return (
					<div
						key={key}
						className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
						data-profile-question
					>
						<span>
							<b>
								{q.brand} {q.model ?? ""}
							</b>{" "}
							footage found. Which colour profile was it shot in?
						</span>
						<div className="flex flex-wrap gap-1">
							{profiles.map((profile) => (
								<Button
									key={profile}
									size="sm"
									variant="outline"
									className="h-7 px-2 text-xs"
									onClick={() => {
										library.rememberProfile({ camera: key, profile });
										for (const mediaId of q.mediaIds) {
											setCamera({
												mediaId,
												camera: { brand: q.brand, model: q.model, profile },
											});
										}
									}}
								>
									{profile}
								</Button>
							))}
						</div>
					</div>
				);
			})}

			{first && (
				<div
					className="flex flex-col gap-2 rounded-xl border p-3"
					data-camera-lut
				>
					<div className="flex items-center justify-between text-xs">
						<span className="text-muted-foreground">Camera LUT (input)</span>
						{detected && (
							<span className="text-muted-foreground">
								{detected.brand} {detected.model ?? ""}{" "}
								{detected.profile ? `· ${detected.profile}` : ""}
							</span>
						)}
					</div>
					{cameraEntry ? (
						<>
							<div className="flex items-center justify-between gap-2 text-sm">
								<span className="truncate font-medium">{cameraEntry.name}</span>
								<Button
									size="icon"
									variant="text"
									aria-label="Remove camera LUT"
									onClick={() =>
										applyCamera({ lutId: null, scope: "selection" })
									}
								>
									<X className="size-4" />
								</Button>
							</div>
							<div className="flex justify-between text-xs">
								<span>Intensity</span>
								<span className="tabular-nums">{Math.round(intensity)}%</span>
							</div>
							<Slider
								value={[intensity]}
								min={0}
								max={100}
								step={1}
								onValueChange={([v]) => setDragIntensity(v)}
								onValueCommit={([v]) => {
									setDragIntensity(null);
									applyCamera({
										lutId: cameraEntry.id,
										scope: "selection",
										intensity: v,
									});
								}}
							/>
							{detected && (
								<Button
									size="sm"
									variant="outline"
									onClick={() =>
										applyCamera({
											lutId: cameraEntry.id,
											scope: "camera",
											intensity,
										})
									}
								>
									Apply to all clips from this camera
								</Button>
							)}
						</>
					) : (
						<p className="text-muted-foreground m-0 text-xs">
							None. Pick a profile below to convert log footage to normal colour
							(Rec.709).
						</p>
					)}
				</div>
			)}

			<div className="flex flex-col gap-1" data-camera-library>
				<span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
					Camera LUT library
				</span>
				{BRANDS.map((brand) => {
					const models = CAMERA_MODELS.filter((c) => c.brand === brand);
					const open = openBrand === brand;
					const count = library.luts.filter(
						(l) => l.kind === "camera" && l.brand === brand,
					).length;
					return (
						<div key={brand} className="rounded-lg border">
							<button
								type="button"
								onClick={() => setOpenBrand(open ? null : brand)}
								className="flex w-full items-center justify-between px-3 py-2 text-sm"
							>
								<span className="flex items-center gap-1.5">
									<ChevronRight
										className={cn("size-3.5 transition", open && "rotate-90")}
									/>
									{brand}
								</span>
								<span className="text-muted-foreground text-xs">
									{count} imported
								</span>
							</button>
							{open && (
								<div className="flex flex-col gap-2 border-t px-3 py-2">
									{[...new Set(models.map((m) => m.line))].map((line) => (
										<div key={line} className="flex flex-col gap-1.5">
											<span className="text-muted-foreground text-[11px]">
												{line}
											</span>
											{models
												.filter((m) => m.line === line)
												.map((camera) => (
													<div
														key={camera.model}
														className="flex flex-wrap items-center gap-1"
														data-camera={camera.model}
													>
														<span className="w-28 shrink-0 truncate text-xs">
															{camera.model}
														</span>
														{camera.profiles
															.filter((p) => p !== "Normal" && p !== "Native")
															.map((profile) => {
																const lut = lutFor({ camera, profile });
																return (
																	<button
																		key={profile}
																		type="button"
																		title={
																			lut
																				? `Apply ${lut.name} as the camera LUT`
																				: `Not imported. Open ${brand}'s download page.`
																		}
																		onClick={() =>
																			lut
																				? applyCamera({
																						lutId: lut.id,
																						scope: "selection",
																					})
																				: openExternal(
																						officialLutUrl({
																							brand,
																							model: camera.model,
																						}),
																					)
																		}
																		className={cn(
																			"flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
																			lut
																				? "border-[#22D3EE]/50 hover:bg-accent"
																				: "text-muted-foreground border-dashed hover:bg-accent/50",
																			cameraEntry &&
																				lut?.id === cameraEntry.id &&
																				"bg-[#22D3EE]/15",
																		)}
																	>
																		{lut ? <Check className="size-3" /> : null}
																		{profile}
																	</button>
																);
															})}
													</div>
												))}
										</div>
									))}
									<button
										type="button"
										className="text-primary flex items-center gap-1 self-start text-xs hover:underline"
										onClick={() => openExternal(officialLutUrl({ brand }))}
									>
										<ExternalLink className="size-3" /> Get official {brand}{" "}
										LUTs
									</button>
									<p className="text-muted-foreground m-0 text-[11px] leading-snug">
										FrameFlow doesn&rsquo;t include {brand}&rsquo;s LUT files.
										Download them from {brand}, then import the .cube files or
										the ZIP. They&rsquo;re filed under the right camera
										automatically.
									</p>
								</div>
							)}
						</div>
					);
				})}
			</div>

			{creative.length > 0 && (
				<div className="flex flex-col gap-1">
					<span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
						My LUTs
					</span>
					{creative.map((lut) => (
						<div
							key={lut.id}
							className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-xs hover:bg-accent/40"
						>
							<span className="truncate">{lut.name}</span>
							<div className="flex shrink-0 gap-1">
								<Button
									size="sm"
									variant="outline"
									className="h-6 px-2 text-[11px]"
									onClick={() => applyCreative(lut.id)}
								>
									Apply
								</Button>
								<Button
									size="icon"
									variant="text"
									className="size-6"
									aria-label={`Delete ${lut.name}`}
									onClick={() => void removeLut(lut.id)}
								>
									<Trash2 className="size-3.5" />
								</Button>
							</div>
						</div>
					))}
				</div>
			)}

			<label className="flex items-center gap-2 text-xs">
				<input
					type="checkbox"
					className="accent-primary size-3.5"
					checked={library.autoApply}
					onChange={(e) => library.setAutoApply(e.target.checked)}
				/>
				Apply the matching camera LUT automatically when footage is imported
			</label>
		</section>
	);
}
