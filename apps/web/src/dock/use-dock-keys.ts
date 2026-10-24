"use client";

import { useEffect } from "react";
import { isDockPanelId } from "./layout";
import { useDockStore } from "./store";

const isTyping = (target: EventTarget | null) =>
	target instanceof Element &&
	target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']") !== null;

/** ` maximises the panel under the pointer, and restores it (SRS layout). */
export function useDockKeys() {
	useEffect(() => {
		let hovered: string | null = null;
		const onMove = (e: PointerEvent) => {
			const slot = e.target instanceof Element ? e.target.closest("[data-dock-slot]") : null;
			hovered = slot?.querySelector("[role=tab][aria-selected=true]")?.getAttribute("data-dock-title") ?? hovered;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "`" || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
			const { maximized, toggleMaximized } = useDockStore.getState();
			const id = maximized ?? (isDockPanelId(hovered) ? hovered : "preview");
			e.preventDefault();
			toggleMaximized(id);
		};
		window.addEventListener("pointermove", onMove, { passive: true });
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("keydown", onKey);
		};
	}, []);
}
