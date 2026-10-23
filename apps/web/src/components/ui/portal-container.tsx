"use client";

import { createContext, useContext } from "react";

/**
 * Where menus, popovers and dialogs render. Panels shown in a separate
 * window (dual screen) set it to that window's body so their menus open
 * there instead of in the main window.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null);

export const PortalContainerProvider = PortalContainerContext.Provider;

export function usePortalContainer(): HTMLElement | undefined {
	return useContext(PortalContainerContext) ?? undefined;
}
