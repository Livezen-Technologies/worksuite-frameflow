"use client";

import { installInputMethod } from "@/input-method/controller";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, PanelTopClose } from "lucide-react";
import { PortalContainerProvider } from "@/components/ui/portal-container";
import { POPOUT_TITLES, type PopoutPanelId, usePopoutStore } from "./store";

const FORWARDED_EVENTS = [
	"keydown",
	"keyup",
	"mousemove",
	"mouseup",
	"pointermove",
	"pointerup",
	"pointercancel",
] as const;

const isTyping = (target: EventTarget | null) =>
	target instanceof Element &&
	target.closest("input, textarea, select, [contenteditable='true']") !== null;

function copyStyles({ from, to }: { from: Document; to: Document }) {
	for (const node of Array.from(
		from.head.querySelectorAll("style, link[rel='stylesheet']"),
	)) {
		to.head.appendChild(node.cloneNode(true));
	}
	to.documentElement.className = from.documentElement.className;
	to.documentElement.style.cssText = from.documentElement.style.cssText;
	to.body.className = from.body.className;
}

/** Re-sends events from the pop-out to the main window, where the editor's
 * shortcuts and drag handlers listen. */
const isKeyboard = (e: Event): e is KeyboardEvent => "key" in e && "code" in e;
const isMouse = (e: Event): e is MouseEvent => "clientX" in e && "button" in e;
const isPointer = (e: Event): e is PointerEvent =>
	isMouse(e) && "pointerId" in e;

function forwardEvents({ child }: { child: Window }) {
	const offs = FORWARDED_EVENTS.map((type) => {
		const handler = (event: Event) => {
			if (event.type.startsWith("key")) {
				if (isTyping(event.target) || !isKeyboard(event)) return;
				document.dispatchEvent(
					new KeyboardEvent(event.type, {
						key: event.key,
						code: event.code,
						ctrlKey: event.ctrlKey,
						shiftKey: event.shiftKey,
						altKey: event.altKey,
						metaKey: event.metaKey,
						repeat: event.repeat,
						bubbles: true,
						cancelable: true,
					}),
				);
				return;
			}
			if (isMouse(event)) {
				const init = {
					clientX: event.clientX,
					clientY: event.clientY,
					screenX: event.screenX,
					screenY: event.screenY,
					button: event.button,
					buttons: event.buttons,
					ctrlKey: event.ctrlKey,
					shiftKey: event.shiftKey,
					altKey: event.altKey,
					metaKey: event.metaKey,
					bubbles: true,
				};
				document.dispatchEvent(
					isPointer(event)
						? new PointerEvent(event.type, {
								...init,
								pointerId: event.pointerId,
							})
						: new MouseEvent(event.type, init),
				);
			}
		};
		child.document.addEventListener(type, handler);
		return () => child.document.removeEventListener(type, handler);
	});
	return () => {
		for (const off of offs) off();
	};
}

function usePopoutWindow({
	id,
	active,
}: {
	id: PopoutPanelId;
	active: boolean;
}) {
	const [container, setContainer] = useState<HTMLElement | null>(null);
	useEffect(() => {
		if (!active) return;
		const child = window.open(
			"",
			`frameflow-${id}`,
			`width=${id === "timeline" ? 1400 : 1000},height=${id === "timeline" ? 520 : 760}`,
		);
		if (!child) {
			usePopoutStore.getState().setOpen({ id, open: false });
			return;
		}
		child.document.title = `${POPOUT_TITLES[id]} · Worksuite FrameFlow`;
		copyStyles({ from: document, to: child.document });
		child.document.body.style.margin = "0";
		const root = child.document.createElement("div");
		root.className =
			"bg-background text-foreground flex h-screen w-screen flex-col p-2";
		child.document.body.appendChild(root);
		const stopForwarding = forwardEvents({ child });
		const removeInputMethod = installInputMethod({ doc: child.document });
		const onClose = () =>
			usePopoutStore.getState().setOpen({ id, open: false });
		child.addEventListener("pagehide", onClose);
		// Keep the theme in step with the main window.
		const themeObserver = new MutationObserver(() => {
			child.document.documentElement.className =
				document.documentElement.className;
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "style"],
		});
		const closeWithMain = () => child.close();
		window.addEventListener("pagehide", closeWithMain);
		// Render into the new window once it exists.
		queueMicrotask(() => setContainer(root));
		return () => {
			setContainer(null);
			themeObserver.disconnect();
			stopForwarding();
			removeInputMethod();
			window.removeEventListener("pagehide", closeWithMain);
			child.removeEventListener("pagehide", onClose);
			child.close();
		};
	}, [id, active]);
	return container;
}

/**
 * Wraps an editor panel so it can move to its own window, for a second
 * monitor. The panel stays the same React tree, so it shares the open
 * project, playback and selection with the main window.
 */
export function PopoutPanel({
	id,
	children,
}: {
	id: PopoutPanelId;
	children: ReactNode;
}) {
	const isOpen = usePopoutStore((s) => !!s.open[id]);
	const setOpen = usePopoutStore((s) => s.setOpen);
	const canPopout = typeof window !== "undefined" && !!window.worksuite;
	const container = usePopoutWindow({ id, active: isOpen && canPopout });

	if (isOpen && container) {
		return (
			<>
				<div
					className="bg-panel text-muted-foreground flex size-full flex-col items-center justify-center gap-2 rounded-sm border text-sm"
					data-popout-placeholder={id}
				>
					{POPOUT_TITLES[id]} is in its own window.
					<button
						type="button"
						className="hover:bg-accent flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs"
						onClick={() => setOpen({ id, open: false })}
					>
						<PanelTopClose className="size-3.5" /> Bring it back
					</button>
				</div>
				{createPortal(
					<PortalContainerProvider value={container}>
						<div className="relative flex min-h-0 flex-1 flex-col">
							{children}
						</div>
					</PortalContainerProvider>,
					container,
				)}
			</>
		);
	}

	return (
		<div className="group/popout relative size-full">
			{children}
			{canPopout && (
				<button
					type="button"
					title={`Move ${POPOUT_TITLES[id].toLowerCase()} to its own window`}
					aria-label={`Move ${POPOUT_TITLES[id].toLowerCase()} to its own window`}
					data-popout={id}
					onClick={() => setOpen({ id, open: true })}
					className="bg-popover/90 text-muted-foreground hover:text-foreground absolute right-1.5 bottom-1.5 z-30 hidden rounded-md border p-1 shadow-sm group-hover/popout:block"
				>
					<ExternalLink className="size-3.5" />
				</button>
			)}
		</div>
	);
}
