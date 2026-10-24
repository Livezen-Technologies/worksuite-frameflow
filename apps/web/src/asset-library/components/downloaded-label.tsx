"use client";

import { useT } from "@/i18n";

/** "Downloaded" (or another Asset Library label) in the interface language, for the panels' Downloaded sections. */
export function DownloadedLabel({ text = "Downloaded" }: { text?: string }) {
	const t = useT();
	return <>{t(text)}</>;
}
