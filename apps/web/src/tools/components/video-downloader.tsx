"use client";

import { Download, FolderOpen, Link2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useEditor } from "@/editor/use-editor";
import { formatBytes, LibraryPageShell } from "@/library/components/page-shell";
import { openSavedInEditor } from "../open-in-editor";

type Item = {
	id: string;
	url: string;
	status: "downloading" | "done" | "error";
	received: number;
	total: number;
	path?: string;
	name?: string;
	error?: string;
};

/**
 * Tools › Video downloader: saves videos from direct links (a link to the
 * file itself, or a page that publishes its video file). Big video sites
 * that hide their files aren't supported.
 */
export function VideoDownloader() {
	const editor = useEditor();
	const router = useRouter();
	const tools = typeof window !== "undefined" ? window.worksuite?.tools : undefined;
	const [url, setUrl] = useState("");
	const [items, setItems] = useState<Item[]>([]);

	useEffect(
		() =>
			tools?.onDownloadProgress(({ jobId, received, total }) =>
				setItems((list) => list.map((i) => (i.id === jobId ? { ...i, received, total } : i))),
			),
		[tools],
	);

	const start = async () => {
		const link = url.trim();
		if (!tools || !link) return;
		const id = crypto.randomUUID();
		setItems((list) => [{ id, url: link, status: "downloading", received: 0, total: 0 }, ...list]);
		setUrl("");
		try {
			const saved = await tools.download({ jobId: id, url: link });
			setItems((list) => list.map((i) => (i.id === id ? { ...i, status: "done", path: saved.path, name: saved.name, received: saved.bytes } : i)));
		} catch (error) {
			const message = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(error);
			setItems((list) => list.map((i) => (i.id === id ? { ...i, status: "error", error: message } : i)));
		}
	};

	return (
		<LibraryPageShell title="Video downloader" subtitle="Save videos and audio from direct links to this computer.">
			{!tools ? (
				<p className="text-muted-foreground">The downloader is part of the desktop app.</p>
			) : (
				<div className="mx-auto flex max-w-3xl flex-col gap-4">
					<form
						className="bg-card flex flex-col gap-3 rounded-xl border p-4"
						onSubmit={(e) => {
							e.preventDefault();
							void start();
						}}
					>
						<label htmlFor="download-url" className="text-sm font-semibold">
							Paste a video link
						</label>
						<div className="flex gap-2">
							<div className="relative flex-1">
								<Link2 className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
								<Input
									id="download-url"
									value={url}
									onChange={(e) => setUrl(e.target.value)}
									placeholder="https://example.com/video.mp4"
									className="pl-8"
									data-download-url
								/>
							</div>
							<Button type="submit" disabled={!url.trim()} data-download-start>
								<Download /> Download
							</Button>
						</div>
						<p className="text-muted-foreground m-0 text-xs leading-relaxed">
							Works with links straight to a video or audio file (MP4, WebM, MOV, MP3…) and with pages that publish
							their video file. Only download videos you have the rights to use. Files go to Downloads › Worksuite.
						</p>
					</form>
					{items.map((item) => (
						<div key={item.id} className="bg-card flex flex-col gap-2 rounded-lg border p-3" data-download-item={item.status}>
							<div className="flex items-center gap-3">
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-medium">{item.name ?? item.url}</div>
									<div className="text-muted-foreground truncate text-xs">
										{item.status === "downloading"
											? item.total
												? `${formatBytes(item.received)} of ${formatBytes(item.total)}`
												: `${formatBytes(item.received)}…`
											: item.status === "done"
												? `${formatBytes(item.received)} · saved`
												: item.url}
									</div>
								</div>
								{item.status === "downloading" ? (
									<Button size="sm" variant="ghost" onClick={() => void tools.cancelDownload(item.id)}>
										Cancel
									</Button>
								) : item.status === "done" && item.path ? (
									<>
										<Button size="sm" variant="ghost" onClick={() => void window.worksuite?.files?.show(item.path ?? "")}>
											<FolderOpen /> Show
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() =>
												void openSavedInEditor({ editor, filePath: item.path ?? "", push: router.push }).catch((e: unknown) =>
													toast.error(e instanceof Error ? e.message : String(e)),
												)
											}
										>
											<Pencil /> Edit
										</Button>
									</>
								) : null}
							</div>
							{item.status === "downloading" && (
								<Progress value={item.total ? (item.received / item.total) * 100 : undefined} className="h-1.5" />
							)}
							{item.error && <p className="m-0 text-xs text-red-500">{item.error}</p>}
						</div>
					))}
				</div>
			)}
		</LibraryPageShell>
	);
}
