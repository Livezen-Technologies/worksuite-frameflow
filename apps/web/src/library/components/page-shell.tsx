"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Header and width for the library pages opened from the home sidebar. */
export function LibraryPageShell({
	title,
	subtitle,
	actions,
	children,
	back = true,
	compact = false,
}: {
	title: string;
	subtitle: string;
	actions?: ReactNode;
	children: ReactNode;
	/** Off in a window of its own, where there is nowhere to go back to. */
	back?: boolean;
	/** Tighter header for a small window whose title bar already names it. */
	compact?: boolean;
}) {
	return (
		<div className="bg-background text-foreground min-h-screen">
			<header className={compact ? "flex items-center gap-3 border-b px-4 py-2" : "flex items-center gap-3 border-b px-5 py-3"}>
				{back && (
					<Link href="/projects" className="text-muted-foreground hover:text-foreground" aria-label="Back to home">
						<ArrowLeft className="size-4" />
					</Link>
				)}
				<div className="min-w-0 flex-1">
					<h1 className={compact ? "sr-only" : "text-lg font-semibold"}>{title}</h1>
					<p className="text-muted-foreground text-xs">{subtitle}</p>
				</div>
				{actions}
			</header>
			<main className={compact ? "mx-auto max-w-5xl p-4" : "mx-auto max-w-7xl p-5"}>{children}</main>
		</div>
	);
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
	if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
