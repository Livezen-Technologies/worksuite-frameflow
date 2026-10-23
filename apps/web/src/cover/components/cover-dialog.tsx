"use client";

import { convertHeif, HEIF_ACCEPT, isHeif } from "@/media/heif";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";

const STRIP_FRAMES = 10;
const COVER_SIZE = 1280;

function toJpeg({ canvas }: { canvas: HTMLCanvasElement }): string {
	return canvas.toDataURL("image/jpeg", 0.9);
}

/** Scales an uploaded image to the project's frame, cropped to fill. */
async function fitUpload({
	file,
	width,
	height,
}: {
	file: File;
	width: number;
	height: number;
}): Promise<string> {
	const source = isHeif({ file }) ? (await convertHeif({ file })).file : file;
	const bitmap = await createImageBitmap(source);
	const scale = Math.min(1, COVER_SIZE / Math.max(width, height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(width * scale);
	canvas.height = Math.round(height * scale);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas unavailable");
	const fill = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
	const w = bitmap.width * fill;
	const h = bitmap.height * fill;
	ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
	bitmap.close();
	return toJpeg({ canvas });
}

/**
 * Add cover: pick a frame from the video on a filmstrip, or upload a
 * picture. The cover becomes the project thumbnail and can lead the export.
 */
export function CoverDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const editor = useEditor();
	const project = useEditor((e) => e.project.getActiveOrNull());
	const duration = useEditor((e) => Number(e.timeline.getTotalDuration()));
	const [tab, setTab] = useState<"video" | "upload">("video");
	const [time, setTime] = useState(0);
	const [strip, setStrip] = useState<string[]>([]);
	const [preview, setPreview] = useState<string | null>(null);
	const [upload, setUpload] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);
	const stripRef = useRef<HTMLDivElement>(null);
	const cover = project?.metadata.cover;
	const aspect = project
		? project.settings.canvasSize.width / project.settings.canvasSize.height
		: 16 / 9;

	// Start from the saved cover each time the dialog opens.
	useEffect(() => {
		if (!open) return;
		queueMicrotask(() => {
			setTab(cover?.source === "upload" ? "upload" : "video");
			setTime(cover?.source === "video" ? cover.time : 0);
			setUpload(cover?.source === "upload" ? cover.image : null);
		});
	}, [open, cover]);

	// Filmstrip across the whole timeline.
	useEffect(() => {
		if (!open || duration <= 0) return;
		let cancelled = false;
		void (async () => {
			const frames: string[] = [];
			for (let i = 0; i < STRIP_FRAMES; i++) {
				const t = Math.round((duration * (i + 0.5)) / STRIP_FRAMES);
				const canvas = await editor.project.renderFrame({ time: t, maxSize: 200 });
				if (cancelled) return;
				frames.push(canvas.toDataURL("image/jpeg", 0.7));
				setStrip([...frames]);
			}
		})().catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [open, duration, editor]);

	// Large preview of the chosen frame.
	useEffect(() => {
		if (!open || tab !== "video") return;
		let cancelled = false;
		const handle = setTimeout(() => {
			void editor.project
				.renderFrame({ time, maxSize: 720 })
				.then((canvas) => {
					if (!cancelled) setPreview(canvas.toDataURL("image/jpeg", 0.85));
				})
				.catch(() => {});
		}, 60);
		return () => {
			cancelled = true;
			clearTimeout(handle);
		};
	}, [open, tab, time, editor]);

	const seekFromPointer = (clientX: number) => {
		const rect = stripRef.current?.getBoundingClientRect();
		if (!rect || duration <= 0) return;
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		setTime(Math.round(ratio * duration));
	};

	const save = async () => {
		if (!project) return;
		setSaving(true);
		try {
			if (tab === "video") {
				const canvas = await editor.project.renderFrame({ time, maxSize: COVER_SIZE });
				await editor.project.setCover({
					cover: { source: "video", time, image: toJpeg({ canvas }) },
				});
			} else if (upload) {
				await editor.project.setCover({ cover: { source: "upload", time: 0, image: upload } });
			} else return;
			toast.success("Cover saved");
			onOpenChange(false);
		} catch (error) {
			toast.error("Couldn't save the cover", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setSaving(false);
		}
	};

	const shown = tab === "video" ? preview : upload;
	const ratio = duration > 0 ? time / duration : 0;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl" data-cover-dialog>
				<DialogHeader>
					<DialogTitle>Add cover</DialogTitle>
				</DialogHeader>
				<div className="bg-accent mx-auto flex rounded-lg p-1">
					{(["video", "upload"] as const).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setTab(t)}
							className={cn(
								"rounded-md px-6 py-1.5 text-sm",
								tab === t ? "bg-background text-foreground shadow" : "text-muted-foreground",
							)}
						>
							{t === "video" ? "From video" : "Upload"}
						</button>
					))}
				</div>
				<div className="flex justify-center">
					<button
						type="button"
						disabled={tab === "video"}
						onClick={() => fileRef.current?.click()}
						className="bg-muted relative flex max-h-[42vh] items-center justify-center overflow-hidden rounded-xl border"
						style={{ aspectRatio: aspect, height: "42vh" }}
					>
						{shown ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img src={shown} alt="Cover" className="size-full object-contain" />
						) : (
							<span className="text-muted-foreground px-4 text-sm">
								{tab === "upload" ? "Click to choose a picture" : "Rendering…"}
							</span>
						)}
					</button>
					<input
						ref={fileRef}
						type="file"
						accept={`image/*,${HEIF_ACCEPT}`}
						className="hidden"
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (!file || !project) return;
							const { width, height } = project.settings.canvasSize;
							void fitUpload({ file, width, height })
								.then(setUpload)
								.catch(() => toast.error("That picture couldn't be opened"));
						}}
					/>
				</div>
				{tab === "video" ? (
					<div
						ref={stripRef}
						role="slider"
						tabIndex={0}
						aria-label="Cover frame"
						aria-valuemin={0}
						aria-valuemax={duration}
						aria-valuenow={time}
						className="relative mt-2 flex h-16 cursor-pointer touch-none overflow-hidden rounded-lg select-none"
						onPointerDown={(e) => {
							e.currentTarget.setPointerCapture(e.pointerId);
							seekFromPointer(e.clientX);
						}}
						onPointerMove={(e) => {
							if (e.buttons === 1) seekFromPointer(e.clientX);
						}}
						onKeyDown={(e) => {
							const step = duration / 100;
							if (e.key === "ArrowRight") setTime((t) => Math.min(duration, t + step));
							if (e.key === "ArrowLeft") setTime((t) => Math.max(0, t - step));
						}}
					>
						{Array.from({ length: STRIP_FRAMES }, (_, i) => (
							<div key={i} className="bg-muted h-full flex-1 border-r border-black/20">
								{strip[i] ? (
									// eslint-disable-next-line @next/next/no-img-element
									<img src={strip[i]} alt="" className="size-full object-cover" />
								) : null}
							</div>
						))}
						<div
							className="pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 rounded bg-white shadow"
							style={{ left: `${ratio * 100}%` }}
						/>
					</div>
				) : null}
				<div className="mt-2 flex items-center gap-2">
					<Button
						variant="secondary"
						disabled={!cover}
						onClick={() => {
							void editor.project.setCover({ cover: null });
							setUpload(null);
							setTime(0);
							toast("Cover removed");
						}}
						title="Remove the cover and use the first frame again"
					>
						New
					</Button>
					<div className="flex-1" />
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={() => void save()}
						disabled={saving || (tab === "upload" && !upload)}
						data-save-cover
					>
						{saving ? "Saving…" : "Save cover"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

/** Cover tile for the timeline toolbar: shows the cover and opens the dialog. */
export function CoverButton() {
	const [open, setOpen] = useState(false);
	const image = useEditor((e) => e.project.getActiveOrNull()?.metadata.cover?.image);
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				title="Add cover"
				className="hover:bg-accent flex h-8 items-center gap-1.5 rounded-md border px-1.5 text-xs"
				data-cover-button
			>
				{image ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={image} alt="" className="h-6 w-10 rounded-sm object-cover" />
				) : null}
				Cover
			</button>
			<CoverDialog open={open} onOpenChange={setOpen} />
		</>
	);
}
