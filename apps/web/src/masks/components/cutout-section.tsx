"use client";

import { useState } from "react";
import { toast } from "sonner";
import { removeBackground } from "@/ai-export/remove-background";
import { mediaOf, replaceClipMedia } from "@/clip-actions/actions";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { buildDefaultEffectInstance } from "@/effects";
import type { ParamValues } from "@/params";
import type { TimelineElement } from "@/timeline";

const KEY = "chroma-key";
const SCREENS: Array<[string, string]> = [
	["Green", "#00FF00"],
	["Blue", "#0047FF"],
];

/**
 * Masks › Cutout: green / blue screen keying for any picture or video, and
 * AI background removal (no screen needed) for photos.
 */
export function CutoutSection({ element, trackId }: { element: TimelineElement; trackId: string }) {
	const editor = useEditor();
	const [busy, setBusy] = useState<string | null>(null);
	if (element.type !== "video" && element.type !== "image") return null;
	const effects = element.effects ?? [];
	const key = effects.find((e) => e.type === KEY);
	const params = key?.params ?? {};
	const num = ({ k, d }: { k: string; d: number }) => (typeof params[k] === "number" ? Number(params[k]) : d);

	const setEffects = (next: typeof effects) =>
		editor.timeline.updateElements({ updates: [{ trackId, elementId: element.id, patch: { effects: next } }] });
	const setKey = (patch: ParamValues) =>
		key && setEffects(effects.map((e) => (e.id === key.id ? { ...e, params: { ...e.params, ...patch } } : e)));
	const toggleKey = () => {
		if (key) setEffects(effects.filter((e) => e.id !== key.id));
		else setEffects([buildDefaultEffectInstance({ effectType: KEY }), ...effects]);
	};

	const cutOut = async () => {
		const asset = mediaOf({ editor, element });
		if (!asset?.file) return;
		try {
			const png = await removeBackground({ image: asset.file, onProgress: setBusy });
			const name = `${asset.name.replace(/\.[^.]+$/, "")} (cut out).png`;
			await replaceClipMedia({ editor, clip: { element, trackId }, file: new File([png], name, { type: "image/png" }) });
			toast.success("Background removed");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Couldn't remove the background");
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="flex flex-col gap-3 border-b px-3.5 py-3" data-cutout>
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium">Green screen</span>
				<Button size="sm" variant={key ? "secondary" : "outline"} onClick={toggleKey} data-chroma-toggle>
					{key ? "Remove" : "Key out a colour"}
				</Button>
			</div>
			{key && (
				<div className="flex flex-col gap-2 text-xs">
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground w-20">Colour</span>
						{SCREENS.map(([label, hex]) => (
							<button
								key={hex}
								type="button"
								onClick={() => setKey({ color: hex })}
								className="h-6 rounded-md border px-2"
								aria-pressed={String(params.color ?? "#00FF00").toUpperCase() === hex}
							>
								<span className="mr-1 inline-block size-2.5 rounded-full align-middle" style={{ background: hex }} />
								{label}
							</button>
						))}
						<input
							type="color"
							aria-label="Key colour"
							value={typeof params.color === "string" ? params.color : "#00FF00"}
							onChange={(e) => setKey({ color: e.target.value })}
							className="h-6 w-8 cursor-pointer rounded border bg-transparent"
						/>
					</div>
					{(
						[
							["similarity", "Strength", 40],
							["smoothness", "Soft edges", 20],
							["spill", "Remove spill", 60],
						] as const
					).map(([k, label, d]) => (
						<label key={k} className="flex items-center gap-2">
							<span className="text-muted-foreground w-20">{label}</span>
							<input type="range" min={0} max={100} value={num({ k, d })} onChange={(e) => setKey({ [k]: Number(e.target.value) })} className="flex-1" />
							<span className="w-8 text-right tabular-nums">{num({ k, d })}</span>
						</label>
					))}
				</div>
			)}
			{element.type === "image" && (
				<div className="flex items-center justify-between gap-2">
					<div className="flex flex-col">
						<span className="text-sm font-medium">Remove background</span>
						<span className="text-muted-foreground text-xs">{busy ?? "AI cut-out of people, on this computer"}</span>
					</div>
					<Button size="sm" variant="outline" disabled={!!busy} onClick={() => void cutOut()} data-remove-background>
						{busy ? "Working…" : "Remove"}
					</Button>
				</div>
			)}
		</div>
	);
}
