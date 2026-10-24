"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import {
	addPackAnimation,
	addUserAnimation,
	packAnimationDragData,
	userAnimationDragData,
} from "../actions";
import {
	loadPackIndex,
	packAssetThumbnailUrl,
	searchPackAssets,
	type PackIndex,
	type PackIndexAsset,
} from "../catalog";
import { listUserLotties, type UserLottie } from "../user-library";
import { LottiePreview } from "./lottie-preview";

const MY_IMPORTS = "my-imports";

/**
 * The Animations library: the bundled Worksuite Assets pack plus the user's
 * imported Lottie files. Hover to play, click + or double-click to add at
 * the playhead, or drag onto the timeline.
 */
export function AnimationsView() {
	const editor = useEditor();
	const [index, setIndex] = useState<PackIndex | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [imports, setImports] = useState<UserLottie[]>([]);
	const [category, setCategory] = useState<string | null>(null);
	const [query, setQuery] = useState("");

	useEffect(() => {
		let cancelled = false;
		loadPackIndex()
			.then((loaded) => !cancelled && setIndex(loaded))
			.catch((cause: Error) => !cancelled && setError(cause.message));
		listUserLotties()
			.then((items) => !cancelled && setImports(items))
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	const frame = editor.project.getActive().settings.canvasSize;
	const visible = useMemo(
		() =>
			index && category !== MY_IMPORTS
				? searchPackAssets({ assets: index.assets, query, category })
				: [],
		[index, query, category],
	);
	const visibleImports = useMemo(() => {
		if (category && category !== MY_IMPORTS) return [];
		const q = query.trim().toLowerCase();
		return imports.filter((item) => !q || item.name.toLowerCase().includes(q));
	}, [imports, query, category]);

	if (error) {
		return <p className="text-muted-foreground py-6 text-center text-xs">{error}</p>;
	}
	if (!index) {
		return (
			<div className="flex justify-center py-8">
				<Spinner className="size-5" />
			</div>
		);
	}

	const chips: Array<{ id: string | null; name: string }> = [
		{ id: null, name: "All" },
		...index.categories.map(({ id, name }) => ({ id, name })),
		...(imports.length ? [{ id: MY_IMPORTS, name: "My imports" }] : []),
	];

	return (
		<div className="flex h-full flex-col gap-2" data-animations-view>
			<div className="flex flex-wrap gap-1">
				{chips.map((chip) => (
					<button
						key={chip.id ?? "all"}
						type="button"
						onClick={() => setCategory(chip.id)}
						className={cn(
							"rounded-full border px-2 py-0.5 text-[11px]",
							category === chip.id
								? "bg-primary text-primary-foreground border-primary"
								: "text-muted-foreground hover:bg-accent",
						)}
					>
						{chip.name}
					</button>
				))}
			</div>
			<Input
				placeholder="Search animations"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				className="h-8"
			/>
			<div className="grid grid-cols-3 gap-2">
				{visible.map((asset) => (
					<AnimationTile
						key={asset.id}
						name={asset.name}
						tags={asset.tags}
						preview={(playing) => (
							<LottiePreview
								source={{ kind: "pack", assetId: asset.id }}
								thumbnailUrl={packAssetThumbnailUrl(asset)}
								playing={playing}
							/>
						)}
						dragData={packAnimationDragData({ asset, frame })}
						onAdd={() => addPackAnimation({ editor, asset })}
					/>
				))}
				{visibleImports.map((entry) => (
					<AnimationTile
						key={entry.id}
						name={entry.name}
						tags={["imported"]}
						preview={(playing) => (
							<LottiePreview source={{ kind: "user", id: entry.id }} playing={playing} />
						)}
						dragData={userAnimationDragData({ entry, frame })}
						onAdd={() => addUserAnimation({ editor, entry })}
					/>
				))}
				{visible.length === 0 && visibleImports.length === 0 && (
					<p className="text-muted-foreground col-span-3 py-6 text-center text-xs">
						No animations match.
					</p>
				)}
			</div>
			<p className="text-muted-foreground pb-2 text-[11px]">
				Import your own Lottie (.json) files from Media.
			</p>
		</div>
	);
}

function AnimationTile({
	name,
	tags,
	preview,
	dragData,
	onAdd,
}: {
	name: string;
	tags: string[];
	preview: (playing: boolean) => React.ReactNode;
	dragData: ReturnType<typeof packAnimationDragData>;
	onAdd: () => void;
}) {
	const [hovered, setHovered] = useState(false);
	const add = () => {
		onAdd();
		toast.success(`Added ${name}`);
	};
	return (
		<div
			className="min-w-0"
			title={`${name} — ${tags.slice(0, 4).join(", ")}\nDouble-click to add at the playhead`}
			data-animation={dragData.id}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			onFocus={() => setHovered(true)}
			onBlur={() => setHovered(false)}
			onDoubleClick={add}
			onKeyDown={(event) => {
				if (event.key === "Enter") add();
			}}
			role="button"
			tabIndex={0}
		>
			<DraggableItem
				name={name}
				preview={
					<div className="size-full bg-[repeating-conic-gradient(#1a1d24_0%_25%,#14171d_0%_50%)] bg-[length:16px_16px]">
						{preview(hovered)}
					</div>
				}
				dragData={dragData}
				onAddToTimeline={add}
				aspectRatio={1}
				shouldShowLabel
				containerClassName="w-full"
			/>
		</div>
	);
}
