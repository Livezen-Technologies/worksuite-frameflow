"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { importDownloadedFile } from "../import-download";

/** In the editor: adds files the Video Downloader window finished to this project. */
export function DownloadImportHost() {
	const editor = useEditor();
	useEffect(() => {
		const off = window.worksuite?.tools?.onImportDownload?.(({ path, mode, track }) => {
			void importDownloadedFile({ editor, filePath: path, mode, track }).catch((error: unknown) =>
				toast.error(error instanceof Error ? error.message : "Couldn't add the download"),
			);
		});
		return () => off?.();
	}, [editor]);
	return null;
}
