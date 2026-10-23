"use client";

import { HEIF_ACCEPT } from "@/media/heif";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Building2,
	ChevronLeft,
	FileAudio,
	FileVideo,
	Folder,
	FolderPlus,
	Image as ImageIcon,
	Loader2,
	Music,
	Palette,
	Plus,
	Stamp,
	Trash2,
	User,
} from "lucide-react";
import { toast } from "sonner";
import type {
	LibraryFolder,
	LibraryItem,
	LibraryKind,
	LibraryScope,
} from "@/account/types";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import { addToLibrary, bringIntoProject } from "../library";

const KIND_ICON: Record<LibraryKind, typeof Folder> = {
	logo: Stamp,
	intro: FileVideo,
	music: Music,
	lut: Palette,
	video: FileVideo,
	image: ImageIcon,
	audio: FileAudio,
	other: Folder,
};

const KIND_LABEL: Record<LibraryKind, string> = {
	logo: "Logo",
	intro: "Intro",
	music: "Music",
	lut: "LUT",
	video: "Video",
	image: "Image",
	audio: "Audio",
	other: "File",
};

/** Personal and team asset library in the Media bin (CL-05). */
export function LibraryView() {
	const editor = useEditor();
	const [scope, setScope] = useState<LibraryScope>("personal");
	const [path, setPath] = useState<LibraryFolder[]>([]);
	const [data, setData] = useState<{
		folders: LibraryFolder[];
		items: LibraryItem[];
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const folderId = path.at(-1)?.id ?? null;

	const load = useCallback(() => {
		const cloud = window.worksuite?.cloud;
		if (!cloud) return;
		cloud.sync("listLibrary", { scope, folderId }).then((result) => {
			setError(null);
			if (result.ok) setData(result.value);
			else {
				setData({ folders: [], items: [] });
				setError(result.message);
			}
		});
	}, [scope, folderId]);

	useEffect(load, [load]);

	const upload = async (files: FileList | null) => {
		for (const file of Array.from(files ?? [])) {
			setBusy(file.name);
			try {
				await addToLibrary({ file, scope, folderId });
				toast.success(`${file.name} added to the ${scope} library`);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "Upload failed");
			}
		}
		setBusy(null);
		load();
	};

	return (
		<div className="flex h-full flex-col gap-2" data-library-view>
			<div className="grid grid-cols-2 gap-1">
				{(
					[
						["personal", "My library", User],
						["team", "Team library", Building2],
					] as const
				).map(([value, label, Icon]) => (
					<button
						key={value}
						type="button"
						data-library-scope={value}
						onClick={() => {
							setScope(value);
							setPath([]);
						}}
						className={cn(
							"flex h-8 items-center justify-center gap-1.5 rounded-md border text-xs",
							scope === value
								? "border-[#22D3EE] bg-[#22D3EE]/10"
								: "hover:bg-accent/40",
						)}
					>
						<Icon className="size-3.5" />
						{label}
					</button>
				))}
			</div>
			<div className="flex items-center gap-1 text-xs">
				{path.length > 0 && (
					<button
						type="button"
						aria-label="Up"
						onClick={() => setPath((p) => p.slice(0, -1))}
						className="hover:bg-accent rounded p-0.5"
					>
						<ChevronLeft className="size-4" />
					</button>
				)}
				<span className="text-muted-foreground min-w-0 flex-1 truncate">
					{[
						scope === "team" ? "Team" : "My library",
						...path.map((f) => f.name),
					].join(" / ")}
				</span>
				<Button
					size="icon"
					variant="text"
					className="size-7"
					aria-label="New folder"
					onClick={async () => {
						const name = window.prompt("Folder name");
						if (!name?.trim()) return;
						const result = await window.worksuite?.cloud?.sync(
							"createLibraryFolder",
							{
								scope,
								name: name.trim(),
								parentId: folderId,
							},
						);
						if (result && !result.ok) toast.error(result.message);
						load();
					}}
				>
					<FolderPlus className="size-3.5" />
				</Button>
				<Button
					size="sm"
					variant="outline"
					className="h-7 px-2 text-xs"
					onClick={() => fileRef.current?.click()}
					disabled={!!busy}
					data-library-upload
				>
					{busy ? (
						<Loader2 className="size-3 animate-spin" />
					) : (
						<Plus className="size-3" />
					)}
					Add
				</Button>
				<input
					ref={fileRef}
					type="file"
					multiple
					className="hidden"
					accept={`image/*,video/*,audio/*,.cube,.zip,${HEIF_ACCEPT}`}
					data-library-input
					onChange={(e) => {
						void upload(e.target.files);
						e.target.value = "";
					}}
				/>
			</div>
			{error && <p className="m-0 text-xs text-amber-300">{error}</p>}
			{!data ? (
				<div className="text-muted-foreground flex flex-1 items-center justify-center text-xs">
					<Loader2 className="mr-2 size-4 animate-spin" /> Loading…
				</div>
			) : data.folders.length === 0 && data.items.length === 0 ? (
				<button
					type="button"
					onClick={() => fileRef.current?.click()}
					className="text-muted-foreground hover:bg-accent/40 rounded-xl border border-dashed p-4 text-xs leading-relaxed"
				>
					{scope === "team"
						? "Nothing shared with your team yet. Add logos, intros, music and LUTs everyone can use."
						: "Keep logos, intros, music and LUTs here to use them in any project, on any computer."}
				</button>
			) : (
				<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
					{data.folders.map((folder) => (
						<button
							key={folder.id}
							type="button"
							onClick={() => setPath((p) => [...p, folder])}
							className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs"
						>
							<Folder className="size-4 text-sky-400" /> {folder.name}
						</button>
					))}
					{data.items.map((item) => {
						const Icon = KIND_ICON[item.kind];
						return (
							<div
								key={item.id}
								className="group hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5"
								data-library-item={item.kind}
							>
								{item.thumbnailUrl ? (
									// eslint-disable-next-line @next/next/no-img-element -- remote thumbnail
									<img
										src={item.thumbnailUrl}
										alt=""
										className="size-8 rounded object-cover"
									/>
								) : (
									<span className="bg-muted flex size-8 items-center justify-center rounded">
										<Icon className="size-4" />
									</span>
								)}
								<div className="min-w-0 flex-1">
									<div className="truncate text-xs" title={item.name}>
										{item.name}
									</div>
									<div className="text-muted-foreground text-[10px]">
										{KIND_LABEL[item.kind]}
										{item.addedBy && scope === "team"
											? ` · ${item.addedBy}`
											: ""}
									</div>
								</div>
								<Button
									size="sm"
									variant="outline"
									className="h-6 px-2 text-[10px]"
									disabled={busy === item.id}
									data-library-use
									onClick={async () => {
										setBusy(item.id);
										try {
											const where = await bringIntoProject({ editor, item });
											toast.success(
												where === "lut"
													? `${item.name} added to your LUTs`
													: `${item.name} added to this project`,
											);
										} catch (e) {
											toast.error(
												e instanceof Error ? e.message : "Download failed",
											);
										} finally {
											setBusy(null);
										}
									}}
								>
									{busy === item.id ? (
										<Loader2 className="size-3 animate-spin" />
									) : (
										"Use"
									)}
								</Button>
								<button
									type="button"
									aria-label={`Remove ${item.name}`}
									className="text-muted-foreground hover:text-destructive hidden group-hover:block"
									onClick={async () => {
										if (
											!window.confirm(`Remove ${item.name} from the library?`)
										)
											return;
										const result = await window.worksuite?.cloud?.sync(
											"removeLibraryItem",
											{ id: item.id },
										);
										if (result && !result.ok) toast.error(result.message);
										load();
									}}
								>
									<Trash2 className="size-3.5" />
								</button>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
