"use client";

import { useEffect, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { useLocale } from "@/i18n/store";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { addAnimationAtPlayhead, addTemplateAtPlayhead, animationDragData, applyAnimationToClips } from "../actions";
import { loadTextLibrary, onTextLibraryChange, type LibraryEntry, type TextLibraryContent } from "../library";
import { localName, type TextLibraryAnimation, type TextLibraryTemplate } from "../manifest";
import { useTextLibraryStore } from "../store";
import { exportTemplate } from "@/lottie/io/export-actions";
import { itemKey, TextLibraryPanel } from "./text-library-panel";

const EMPTY_GIF = typeof Image !== "undefined" ? Object.assign(new Image(), { src: "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=" }) : null;

/** The Text library panel connected to the editor (sidebar → Text → Animate). */
export function TextLibraryView() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	const { selectedElements } = useElementSelection();
	const locale = useLocale((s) => s.locale);
	const lang = locale === "si" || locale === "ta" ? locale : "en";
	const store = useTextLibraryStore();
	const [content, setContent] = useState<TextLibraryContent | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const load = () =>
			loadTextLibrary()
				.then((c) => !cancelled && setContent(c))
				.catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load the text library"));
		load();
		const off = onTextLibraryChange(load);
		return () => {
			cancelled = true;
			off();
		};
	}, []);

	const selectedText = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.filter(({ element }) => element.type === "text")
		.map(({ track, element }) => ({ trackId: track.id, elementId: element.id }));

	const onAdd = (item: LibraryEntry, text: string) => {
		store.markUsed(itemKey(item));
		if (item.kind === "animation") addAnimationAtPlayhead({ editor, item: item as TextLibraryAnimation, text, lang });
		else
			addTemplateAtPlayhead({ editor, template: item as TextLibraryTemplate, lang }).catch((e: unknown) =>
				toast.error(e instanceof Error ? e.message : "Couldn't add the template"),
			);
	};

	const onDragStart = (event: DragEvent, item: LibraryEntry, text: string) => {
		if (item.kind !== "animation") {
			event.preventDefault();
			return;
		}
		if (EMPTY_GIF) event.dataTransfer.setDragImage(EMPTY_GIF, 0, 0);
		store.markUsed(itemKey(item));
		editor.timeline.dragSource.begin({ dataTransfer: event.dataTransfer, dragData: animationDragData({ item: item as TextLibraryAnimation, text, lang }) });
	};

	return (
		<TextLibraryPanel
			content={content}
			error={error}
			lang={lang}
			favourites={store.favourites}
			recent={store.recent}
			previewText={store.previewText}
			onPreviewTextChange={store.setPreviewText}
			onToggleFavourite={store.toggleFavourite}
			onAdd={onAdd}
			selectedTextCount={selectedText.length}
			onApply={(item) => {
				applyAnimationToClips({ editor, animation: item.animation, targets: selectedText });
				store.markUsed(itemKey(item));
				toast.success(`Animated ${selectedText.length} clip${selectedText.length === 1 ? "" : "s"} with “${localName(item.name, lang)}”`);
			}}
			onDragStart={onDragStart}
			onDragEnd={() => editor.timeline.dragSource.end()}
			onExportTemplate={(item, format) =>
				exportTemplate({ template: item, lang, format, frame: editor.project.getActive().settings.canvasSize }).catch((e: unknown) =>
					toast.error(e instanceof Error ? e.message : "Export failed"),
				)
			}
		/>
	);
}
