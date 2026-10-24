"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBrandKit } from "@/brand/store";
import { useEditor } from "@/editor/use-editor";
import { packContent } from "@/asset-library/registry";
import { useInputMethod } from "@/input-method/store";
import type { GraphicElement } from "@/timeline";
import { findPackAsset, type PackIndexAsset } from "../catalog";
import { loadLottieJson } from "../player";
import type { LottieElementData, LottieJson } from "../types";
import { MotionEditor } from "./motion-editor";
import { serializeMotion } from "./overrides";
import { saveMotionPreset, useMotionEditor } from "./store";

/**
 * Mounts the Motion Editor for the clip in `useMotionEditor`. Live edits
 * preview on the clip; finished edits go through timeline.updateElements,
 * so they are commands with undo/redo like any other edit, and preview
 * and export draw them with the same renderer.
 */
export function MotionEditorHost() {
	const editor = useEditor();
	const target = useMotionEditor((s) => s.target);
	const close = useMotionEditor((s) => s.close);
	const brand = useBrandKit();
	const [loaded, setLoaded] = useState<{ key: string; asset: PackIndexAsset | null; json: LottieJson } | null>(null);
	const [draft, setDraft] = useState<LottieElementData | null>(null);

	const element = target
		? ((editor.timeline.getTrackById({ trackId: target.trackId })?.elements.find((e) => e.id === target.elementId) as (GraphicElement & { lottie?: LottieElementData }) | undefined) ?? null)
		: null;
	const committed = element?.lottie ?? null;
	const data = draft ?? committed;
	const key = committed ? JSON.stringify(committed.source) : "";

	useEffect(() => {
		setDraft(null);
	}, [target?.elementId]);

	useEffect(() => {
		if (!committed) return;
		let cancelled = false;
		const source = committed.source;
		Promise.all([loadLottieJson(source), source.kind === "pack" ? findPackAsset(source.assetId, source.pack) : Promise.resolve(null)])
			.then(([json, asset]) => !cancelled && setLoaded({ key, json, asset }))
			.catch(() => !cancelled && close());
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the source
	}, [key]);

	if (!target || !element || !data || !loaded || loaded.key !== key) return null;

	const commit = (next: LottieElementData) => {
		setDraft(null);
		editor.timeline.updateElements({ updates: [{ trackId: target.trackId, elementId: element.id, patch: { lottie: next } as never }] });
	};

	const fonts = [
		...packContent("fonts").map((f) => f.name),
		...[brand.headingFont, brand.bodyFont].filter(Boolean),
	] as string[];

	return createPortal(
		<MotionEditor
			data={data}
			asset={loaded.asset}
			json={loaded.json}
			onChange={(next, done) => (done ? commit(next) : setDraft(next))}
			onClose={() => {
				if (draft) commit(draft);
				close();
			}}
			onUndo={() => editor.command.undo()}
			onRedo={() => editor.command.redo()}
			brandColors={brand.colors}
			brandFont={brand.headingFont || null}
			brandLogo={brand.logos[0]?.dataUrl ?? null}
			fonts={fonts}
			mediaImages={editor.media
				.getAssets()
				.filter((m) => m.type === "image")
				.map((m) => ({ id: m.id, name: m.name, load: async () => m.file }))}
			onSavePreset={(name, value) => saveMotionPreset(name, serializeMotion(value))}
			onLanguageChange={(lang) => {
				const store = useInputMethod.getState() as unknown as { setMode?: (mode: string) => void };
				store.setMode?.(lang);
			}}
		/>,
		document.body,
	);
}
