"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { Checkbox } from "@/components/ui/checkbox";
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
	onMotionPacksChange,
	packAssetThumbnailUrl,
	groupPackCategories,
	packLanguages,
	resolvePackVariant,
	searchPackAssets,
	type PackIndex,
	type PackIndexAsset,
	type PackSoundCue,
	packSoundUrl,
} from "../catalog";
import { listUserLotties, type UserLottie } from "../user-library";
import { LottiePreview } from "./lottie-preview";
import { AssetLibraryButton } from "@/asset-library/components/asset-library-button";

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
	/** Language filter; also picks the variant that is previewed and added. */
	const [language, setLanguage] = useState<string | null>(null);
	/** Place an animation's sound effects with it. */
	const [addSound, setAddSound] = useState(true);
	/** Hover previews stay silent until the user clicks in the panel (autoplay rules) and while muted. */
	const [soundUnlocked, setSoundUnlocked] = useState(false);
	const [previewMuted, setPreviewMuted] = useState(false);

	useEffect(() => {
		let cancelled = false;
		loadPackIndex()
			.then((loaded) => !cancelled && setIndex(loaded))
			.catch((cause: Error) => !cancelled && setError(cause.message));
		listUserLotties()
			.then((items) => !cancelled && setImports(items))
			.catch(() => {});
		// Packs installed from the Asset Library join the library as they arrive.
		const stop = onMotionPacksChange(() => {
			loadPackIndex()
				.then((loaded) => !cancelled && setIndex(loaded))
				.catch(() => {});
		});
		return () => {
			cancelled = true;
			stop();
		};
	}, []);

	const frame = editor.project.getActive().settings.canvasSize;
	const visible = useMemo(
		() =>
			index && category !== MY_IMPORTS
				? searchPackAssets({ assets: index.assets, query, category, language })
				: [],
		[index, query, category, language],
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

	const languages = packLanguages(
		category ? index.assets.filter((asset) => asset.category === category) : index.assets,
	);

	const chip = (id: string | null, name: string) => (
		<button
			key={id ?? "all"}
			type="button"
			onClick={() => setCategory(id)}
			className={cn(
				"rounded-full border px-2 py-0.5 text-[11px]",
				category === id
					? "bg-primary text-primary-foreground border-primary"
					: "text-muted-foreground hover:bg-accent",
			)}
		>
			{name}
		</button>
	);
	const groups = groupPackCategories(index.categories);

	return (
		<div
			className="flex h-full flex-col gap-2"
			data-animations-view
			onPointerDown={() => setSoundUnlocked(true)}
		>
			<AssetLibraryButton type="motion" />
			{groups.map(({ group, categories }) => (
				<div key={group ?? "main"} className="flex flex-wrap items-center gap-1" aria-label={group ?? "Categories"}>
					{group && <span className="text-muted-foreground text-[11px]">{group}</span>}
					{group === null && chip(null, "All")}
					{categories.map(({ id, name }) => chip(id, name))}
					{group === null && imports.length > 0 && chip(MY_IMPORTS, "My imports")}
				</div>
			))}
			{languages.length > 1 && (
				<div className="flex flex-wrap items-center gap-1" aria-label="Language">
					<span className="text-muted-foreground text-[11px]">Language</span>
					{[{ id: null as string | null, name: "Any" }, ...languages].map((lang) => (
						<button
							key={lang.id ?? "any"}
							type="button"
							onClick={() => setLanguage(lang.id)}
							className={cn(
								"rounded-full border px-2 py-0.5 text-[11px]",
								language === lang.id
									? "bg-primary text-primary-foreground border-primary"
									: "text-muted-foreground hover:bg-accent",
							)}
						>
							{lang.name}
						</button>
					))}
				</div>
			)}
			<Input
				placeholder="Search animations"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				className="h-8"
			/>
			<div className="flex items-center gap-3 text-[11px]">
				<label className="text-muted-foreground flex items-center gap-1.5">
					<Checkbox
						checked={addSound}
						onCheckedChange={(checked) => setAddSound(checked === true)}
						aria-label="Add sound"
					/>
					Add sound
				</label>
				<button
					type="button"
					className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1"
					onClick={() => setPreviewMuted((muted) => !muted)}
					aria-pressed={previewMuted}
					title={previewMuted ? "Unmute preview sounds" : "Mute preview sounds"}
				>
					{previewMuted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
					{previewMuted ? "Preview muted" : "Preview sound"}
				</button>
			</div>
			<div className="grid grid-cols-3 gap-2">
				{visible.map((asset) => {
					const variant = resolvePackVariant(asset, language);
					return (
						<AnimationTile
							key={`${asset.id}@${variant ?? ""}`}
							name={asset.name}
							tags={asset.tags}
							preview={(playing) => (
								<LottiePreview
									source={variant ? { kind: "pack", assetId: asset.id, variant } : { kind: "pack", assetId: asset.id }}
									thumbnailUrl={packAssetThumbnailUrl(asset, variant)}
									playing={playing}
								/>
							)}
							dragData={packAnimationDragData({ asset, frame, variant, withSound: addSound })}
							onAdd={() => addPackAnimation({ editor, asset, variant, withSound: addSound })}
							sounds={soundUnlocked && !previewMuted ? asset.sounds : undefined}
						/>
					);
				})}
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
	sounds,
}: {
	/** Played with the hover preview; absent when silent. */
	sounds?: PackSoundCue[];
	name: string;
	tags: string[];
	preview: (playing: boolean) => React.ReactNode;
	dragData: ReturnType<typeof packAnimationDragData>;
	onAdd: () => void;
}) {
	const [hovered, setHovered] = useState(false);
	usePreviewSounds(hovered ? sounds : undefined);
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

/** Plays `sounds` at their times while set; stops when cleared. */
function usePreviewSounds(sounds: PackSoundCue[] | undefined) {
	const playing = useRef<HTMLAudioElement[]>([]);
	useEffect(() => {
		if (!sounds?.length) return;
		const timers = sounds.map((cue) =>
			window.setTimeout(() => {
				const audio = new Audio(packSoundUrl(cue));
				audio.volume = Math.min(1, 10 ** ((cue.gainDb ?? 0) / 20));
				playing.current.push(audio);
				audio.play().catch(() => {});
			}, cue.at * 1000),
		);
		return () => {
			for (const timer of timers) window.clearTimeout(timer);
			for (const audio of playing.current) audio.pause();
			playing.current = [];
		};
	}, [sounds]);
}
