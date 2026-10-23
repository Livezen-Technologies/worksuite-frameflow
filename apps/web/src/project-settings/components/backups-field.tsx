"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { EditorCore } from "@/core";
import { BACKUP_INTERVAL_MS, BACKUPS_KEPT } from "@/services/storage/service";
import { storageService } from "@/services/storage/service";

/** Earlier versions of the project with Restore (PS-21). */
export function BackupsField({ editor, projectId }: { editor: EditorCore; projectId: string }) {
	const [backups, setBackups] = useState<{ key: string; savedAt: string }[] | null>(null);
	const [busy, setBusy] = useState(false);
	const router = useRouter();
	useEffect(() => {
		let live = true;
		void storageService.listBackups({ projectId }).then((list) => {
			if (live) setBackups(list);
		});
		return () => {
			live = false;
		};
	}, [projectId]);

	const restore = async ({ key, savedAt }: { key: string; savedAt: string }) => {
		if (!window.confirm(`Open the version from ${new Date(savedAt).toLocaleString()} as a new project? This project stays as it is.`))
			return;
		setBusy(true);
		try {
			await editor.project.saveCurrentProject();
			const id = await storageService.restoreBackup({ projectId, key });
			toast.success("Backup opened as a new project", { description: new Date(savedAt).toLocaleString() });
			router.push(`/editor/${id}`);
		} catch (error) {
			toast.error("Couldn't restore", { description: error instanceof Error ? error.message : String(error) });
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex flex-col gap-1" data-backups>
			<p className="text-muted-foreground m-0 text-xs">
				A copy is kept every {BACKUP_INTERVAL_MS / 60000} minutes while you work, the newest {BACKUPS_KEPT}.
			</p>
			{backups === null ? null : backups.length === 0 ? (
				<p className="text-muted-foreground m-0 text-xs">No backups yet.</p>
			) : (
				<div className="flex max-h-36 flex-col gap-0.5 overflow-y-auto">
					{backups.map((b) => (
						<div key={b.key} className="flex items-center justify-between gap-2 text-xs" data-backup={b.savedAt}>
							<span>{new Date(b.savedAt).toLocaleString()}</span>
							<Button size="sm" variant="outline" className="h-6 text-xs" disabled={busy} onClick={() => void restore({ key: b.key, savedAt: b.savedAt })}>
								Restore
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
