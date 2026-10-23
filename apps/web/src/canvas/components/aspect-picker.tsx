"use client";

import { Check } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useEditor } from "@/editor/use-editor";
import type { TCanvasSize } from "@/project/types";
import { isVisualElement, hasMediaId } from "@/timeline/element-utils";
import { cn } from "@/utils/ui";
import { DEFAULT_CANVAS_PRESETS } from "../sizes";

interface AspectOption {
	id: string;
	label: string;
	hint?: string;
	size: TCanvasSize;
}

const GROUPS: AspectOption[][] = [
	[
		{
			id: "16:9",
			label: "16:9",
			hint: "YouTube, YouTube ads",
			size: { width: 1920, height: 1080 },
		},
		{
			id: "4:3",
			label: "4:3",
			hint: "LinkedIn ads, Facebook",
			size: { width: 1440, height: 1080 },
		},
		{
			id: "2:1",
			label: "2:1",
			hint: "Cinematic, 360° video",
			size: { width: 1920, height: 960 },
		},
	],
	[
		{
			id: "9:16",
			label: "9:16",
			hint: "TikTok, Reels, Shorts",
			size: { width: 1080, height: 1920 },
		},
		{
			id: "1:1",
			label: "1:1",
			hint: "Instagram posts",
			size: { width: 1080, height: 1080 },
		},
		{
			id: "3:4",
			label: "3:4",
			hint: "Instagram portrait, Pinterest",
			size: { width: 1080, height: 1440 },
		},
		{
			id: "4:5",
			label: "4:5",
			hint: "Instagram feed",
			size: { width: 1080, height: 1350 },
		},
	],
];

const gcd = ({ a, b }: { a: number; b: number }): number =>
	b === 0 ? a : gcd({ a: b, b: a % b });

export function ratioLabel(size: TCanvasSize): string {
	for (const option of GROUPS.flat()) {
		if (
			Math.abs(
				option.size.width / option.size.height - size.width / size.height,
			) < 0.005
		) {
			return option.label;
		}
	}
	const d = gcd({ a: size.width, b: size.height }) || 1;
	return `${size.width / d}:${size.height / d}`;
}

function Shape({
	size,
	dashed = false,
	active = false,
}: {
	size: TCanvasSize;
	dashed?: boolean;
	active?: boolean;
}) {
	const ratio = size.width / size.height;
	const w = ratio >= 1 ? 22 : Math.max(10, 22 * ratio);
	const h = ratio >= 1 ? Math.max(9, 22 / ratio) : 22;
	return (
		<span className="flex size-7 shrink-0 items-center justify-center">
			<span
				className={cn(
					"rounded-[4px] border-2",
					dashed ? "border-dashed" : "",
					active ? "border-[#22D3EE]" : "border-muted-foreground/60",
				)}
				style={{ width: w, height: h }}
			/>
		</span>
	);
}

function Row({
	option,
	dashed,
	current,
	apply,
}: {
	option: AspectOption;
	dashed?: boolean;
	current: string;
	apply: (size: TCanvasSize) => void;
}) {
	const active = !dashed && option.label === current;
	return (
		<button
			type="button"
			onClick={() => apply(option.size)}
			data-aspect={option.id}
			className="hover:bg-accent flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left"
		>
			<Shape size={option.size} dashed={dashed} active={active} />
			<span className="min-w-0 flex-1">
				<span className="block text-sm">{option.label}</span>
				{option.hint && (
					<span className="text-muted-foreground block truncate text-xs">
						{option.hint}
					</span>
				)}
			</span>
			{active && <Check className="size-4 text-[#22D3EE]" />}
		</button>
	);
}

/** Aspect-ratio picker at the top-left of the preview (canvas size). */
export function AspectPicker() {
	const editor = useEditor();
	const project = useEditor((e) => e.project.getActiveOrNull());
	if (!project) return null;
	const size = project.settings.canvasSize;
	const current = ratioLabel(size);

	const original = (() => {
		const tracks = editor.scenes.getActiveSceneOrNull()?.tracks;
		const assets = editor.media.getAssets();
		for (const track of tracks ? [tracks.main, ...tracks.overlay] : []) {
			for (const element of track.elements) {
				if (!isVisualElement(element) || !hasMediaId(element)) continue;
				const asset = assets.find((a) => a.id === element.mediaId);
				if (asset?.width && asset.height) {
					const scale = 1920 / Math.max(asset.width, asset.height);
					const even = (n: number) =>
						Math.max(2, Math.round((n * scale) / 2) * 2);
					return { width: even(asset.width), height: even(asset.height) };
				}
			}
		}
		return null;
	})();

	const apply = (canvasSize: TCanvasSize) => {
		const isPreset = DEFAULT_CANVAS_PRESETS.some(
			(p) => p.width === canvasSize.width && p.height === canvasSize.height,
		);
		void editor.project.updateSettings({
			settings: {
				canvasSize,
				canvasSizeMode: isPreset ? "preset" : "custom",
				...(isPreset ? {} : { lastCustomCanvasSize: canvasSize }),
			},
		});
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="bg-popover/90 hover:bg-popover pointer-events-auto absolute top-2 left-2 z-20 flex flex-col items-center gap-0.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium shadow-sm"
					title="Aspect ratio"
					data-aspect-picker
				>
					<Shape size={size} active />
					{current}
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" side="right" className="w-64 p-1.5">
				{original && (
					<>
						<Row
							option={{
								id: "original",
								label: "Original aspect ratio",
								size: original,
							}}
							dashed
							current={current}
							apply={apply}
						/>
						<div className="bg-border mx-2 my-1 h-px" />
					</>
				)}
				{GROUPS.map((group, i) => (
					<div key={group[0]?.id ?? i}>
						{i > 0 && <div className="bg-border mx-2 my-1 h-px" />}
						{group.map((option) => (
							<Row
								key={option.id}
								option={option}
								current={current}
								apply={apply}
							/>
						))}
					</div>
				))}
				<div className="text-muted-foreground px-2 pt-1 pb-0.5 text-[10px]">
					{size.width} × {size.height}
				</div>
			</PopoverContent>
		</Popover>
	);
}
