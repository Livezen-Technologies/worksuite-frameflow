"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

interface AppBridge {
	setTheme?: (theme: string) => Promise<string>;
}

function appBridge(): AppBridge | null {
	if (typeof window === "undefined") return null;
	const worksuite: unknown = Reflect.get(window, "worksuite");
	if (!worksuite || typeof worksuite !== "object") return null;
	const app: unknown = Reflect.get(worksuite, "app");
	return app && typeof app === "object" ? app : null;
}

/** Keeps the desktop window's title bar on the app's Light/Dark/System choice. */
export function NativeThemeSync() {
	const { theme } = useTheme();
	useEffect(() => {
		if (theme) void appBridge()?.setTheme?.(theme);
	}, [theme]);
	return null;
}
