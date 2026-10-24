"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/** Renders only in the window: these tools talk to the desktop app, never on the server. */
export function ClientOnly({ children }: { children: React.ReactNode }) {
	const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
	return mounted ? children : <div className="bg-background min-h-screen" />;
}
