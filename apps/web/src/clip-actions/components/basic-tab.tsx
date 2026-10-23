"use client";

import { useState } from "react";
import { Ban, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ElementParamsTab } from "@/components/editor/panels/properties/components/element-params-tab";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { usePropertiesStore } from "@/components/editor/panels/properties/stores/properties-store";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/editor/use-editor";
import type { VisualElement } from "@/timeline";
import {
	hasDeflicker,
	hasDenoise,
	isStabilized,
	setDeflicker,
	setDenoise,
	setStabilize,
} from "../enhance";
import { mediaOf } from "../actions";
import { HdrSection } from "@/hdr/components/hdr-section";

const BLEND_KEYS = ["opacity", "blendMode"] as const;
const TRANSFORM_KEYS = [
	"transform.positionX",
	"transform.positionY",
	"transform.scaleX",
	"transform.scaleY",
	"transform.rotate",
] as const;

function LinkRow({
	title,
	detail,
	icon,
	onClick,
}: {
	title: string;
	detail: string;
	icon?: React.ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="hover:bg-accent/40 flex w-full items-center gap-3 border-b px-4 py-3 text-left"
		>
			{icon}
			<span className="min-w-0 flex-1">
				<span className="block text-sm font-semibold">{title}</span>
				<span className="text-muted-foreground block truncate text-xs">
					{detail}
				</span>
			</span>
			<ChevronRight className="text-muted-foreground size-4" />
		</button>
	);
}

function ToggleRow({
	title,
	detail,
	checked,
	busy,
	disabled,
	onChange,
}: {
	title: string;
	detail: string;
	checked: boolean;
	busy?: number | null;
	disabled?: boolean;
	onChange: (on: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-3 border-b px-4 py-3">
			<div className="min-w-0">
				<div className="text-sm font-semibold">{title}</div>
				<div className="text-muted-foreground text-xs leading-relaxed">
					{busy != null ? `Analysing… ${Math.round(busy * 100)}%` : detail}
				</div>
			</div>
			{busy != null ? (
				<Loader2 className="size-4 animate-spin" />
			) : (
				<Switch
					checked={checked}
					disabled={disabled}
					onCheckedChange={onChange}
				/>
			)}
		</div>
	);
}

/** Basic tab for video and image clips. */
export function BasicTab({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const editor = useEditor();
	const [busy, setBusy] = useState<{ key: string; progress: number } | null>(
		null,
	);
	const clip = { trackId, element };
	const asset = mediaOf({ editor, element });
	const isVideo = asset?.type === "video";
	const mask = "masks" in element ? element.masks?.[0] : undefined;

	const runAnalysis = async ({
		key,
		task,
	}: {
		key: string;
		task: (onProgress: (p: number) => void) => Promise<void>;
	}) => {
		setBusy({ key, progress: 0 });
		try {
			await task((progress) => setBusy({ key, progress }));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "That didn't work");
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="flex flex-col" data-basic-tab>
			<LinkRow
				title="Mask"
				detail={
					mask ? mask.type[0]?.toUpperCase() + mask.type.slice(1) : "None"
				}
				icon={
					<span className="bg-muted flex size-9 items-center justify-center rounded-md">
						<Ban className="text-muted-foreground size-4" />
					</span>
				}
				onClick={() =>
					usePropertiesStore
						.getState()
						.setActiveTab({ elementType: element.type, tabId: "masks" })
				}
			/>
			<LinkRow
				title="Color adjustment"
				detail="Basic, wheels, LUTs, scopes"
				onClick={() =>
					useAssetsPanelStore.getState().setActiveTab("adjustment")
				}
			/>
			{asset?.type === "video" && <HdrSection asset={asset} />}
			<ElementParamsTab
				element={element}
				trackId={trackId}
				paramKeys={BLEND_KEYS}
				sectionKey="basic-blend"
			/>
			{isVideo && (
				<ToggleRow
					title="Stabilize"
					detail="Smooths camera shake (adds position keyframes and a 10% zoom)"
					checked={isStabilized(element)}
					busy={busy?.key === "stabilize" ? busy.progress : null}
					disabled={!!busy}
					onChange={(on) =>
						void runAnalysis({
							key: "stabilize",
							task: (onProgress) =>
								setStabilize({ editor, clip, on, onProgress }),
						})
					}
				/>
			)}
			<ToggleRow
				title="Reduce image noise"
				detail="Edge-preserving denoise; adjust strength under Effects"
				checked={hasDenoise(element)}
				onChange={(on) => setDenoise({ editor, clip, on })}
			/>
			{isVideo && (
				<ToggleRow
					title="Remove flicker"
					detail="Evens out brightness changes from frame to frame"
					checked={hasDeflicker(element)}
					busy={busy?.key === "flicker" ? busy.progress : null}
					disabled={!!busy}
					onChange={(on) =>
						void runAnalysis({
							key: "flicker",
							task: (onProgress) =>
								setDeflicker({ editor, clip, on, onProgress }),
						})
					}
				/>
			)}
			<ElementParamsTab
				element={element}
				trackId={trackId}
				paramKeys={TRANSFORM_KEYS}
				sectionKey="basic-transform"
			/>
		</div>
	);
}
