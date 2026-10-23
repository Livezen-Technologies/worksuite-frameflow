import { isHeif } from "./heif";
import { useEffect } from "react";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { AddMediaAssetCommand } from "@/commands/media";
import { InsertElementCommand } from "@/commands/timeline";
import { BatchCommand } from "@/commands";
import { defaultStillDuration } from "@/timeline/creation";
import { mediaTimeFromSeconds } from "@/wasm";
import { isTypableDOMElement } from "@/utils/browser";
import type { MediaType } from "@/media/types";
import { looksLikeSubtitles } from "@/clipboard/fit";
import { parseSrt } from "@/subtitles/srt";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import { buildTextElement } from "@/timeline/element-utils";
import type { EditorCore } from "@/core";

/** Text from another app becomes captions or a title clip (MP-18). */
function pasteText({ editor, text }: { editor: EditorCore; text: string }) {
	if (looksLikeSubtitles(text)) {
		const { captions } = parseSrt({ input: text.replace(/^WEBVTT[^\n]*\n/, "") });
		if (captions.length > 0) {
			insertCaptionChunksAsTextTrack({ editor, captions });
			return;
		}
	}
	const element = buildTextElement({
		raw: { name: text.slice(0, 40), params: { content: text } },
		startTime: editor.playback.getCurrentTime(),
	});
	editor.command.execute({
		command: new InsertElementCommand({
			element,
			placement: { mode: "auto", trackType: "text" },
		}),
	});
}

const MEDIA_MIME_PREFIXES: MediaType[] = ["image", "video", "audio"];

function isMediaMimeType({ type }: { type: string }): boolean {
	return MEDIA_MIME_PREFIXES.some((prefix) => type.startsWith(`${prefix}/`));
}

function extractMediaFilesFromClipboard({
	clipboardData,
}: {
	clipboardData: DataTransfer | null;
}): File[] {
	if (!clipboardData?.items) return [];

	const files: File[] = [];
	for (const item of clipboardData.items) {
		if (item.kind !== "file") continue;
		const file = item.getAsFile();
		if (!file) continue;
		// HEIC and 360° camera files often come without a MIME type (HE-01).
		if (isMediaMimeType({ type: item.type }) || isHeif({ file }) || /\.(insv|360)$/i.test(file.name))
			files.push(file);
	}
	return files;
}

export function usePasteMedia() {
	const editor = useEditor();

	useEffect(() => {
		const handlePaste = async (event: ClipboardEvent) => {
			const activeElement = document.activeElement as HTMLElement;

			if (activeElement && isTypableDOMElement({ element: activeElement })) {
				return;
			}

			const files = extractMediaFilesFromClipboard({
				clipboardData: event.clipboardData,
			});
			if (files.length === 0) {
				event.preventDefault();
				const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
				if (text && !editor.clipboard.isOwnText(text)) {
					pasteText({ editor, text });
					return;
				}
				editor.clipboard.paste();
				return;
			}

			event.preventDefault();

			const activeProject = editor.project.getActive();
			if (!activeProject) return;

			try {
				await showMediaUploadToast({
					filesCount: files.length,
					promise: async () => {
						const processedAssets = await processMediaAssets({ files });
						const startTime = editor.playback.getCurrentTime();

						for (const asset of processedAssets) {
							const addMediaCmd = new AddMediaAssetCommand({
								projectId: activeProject.metadata.id,
								asset,
							});
							const assetId = addMediaCmd.getAssetId();
							const duration =
								asset.duration != null
									? mediaTimeFromSeconds({ seconds: asset.duration })
									: defaultStillDuration();
							const trackType = asset.type === "audio" ? "audio" : "video";

							const element = buildElementFromMedia({
								mediaId: assetId,
								mediaType: asset.type,
								name: asset.name,
								duration,
								startTime,
								buffer:
									asset.type === "audio"
										? new AudioBuffer({ length: 1, sampleRate: 44100 })
										: undefined,
							});

							const insertCmd = new InsertElementCommand({
								element,
								placement: { mode: "auto", trackType },
							});
							const batchCmd = new BatchCommand([addMediaCmd, insertCmd]);
							editor.command.execute({ command: batchCmd });
						}

						return {
							uploadedCount: processedAssets.length,
							assetNames: processedAssets.map((asset) => asset.name),
						};
					},
				});
			} catch (error) {
				console.error("Failed to paste media:", error);
			}
		};

		window.addEventListener("paste", handlePaste);
		return () => window.removeEventListener("paste", handlePaste);
	}, [editor]);
}
