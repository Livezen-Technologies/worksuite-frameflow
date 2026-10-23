"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { planRelink } from "../format";
import { useProjectFolders } from "../store";
import { relinkMedia, startFolderAutosave, writeProjectFolder } from "../sync";

/** Keeps linked project folders saved and asks to relink missing media. */
export function ProjectFolderHost() {
	useEffect(() => startFolderAutosave(), []);
	return <RelinkDialog />;
}

function RelinkDialog() {
	const relink = useProjectFolders((s) => s.relink);
	const setRelink = useProjectFolders((s) => s.setRelink);
	const input = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	if (!relink) return null;
	const { projectId, missing } = relink;

	const onFiles = async (list: FileList | null) => {
		const picked = [...(list ?? [])];
		if (!picked.length) return;
		const plan = planRelink({ missing, picked });
		const pairs = missing.flatMap((entry) => {
			const index = plan.get(entry.id);
			return index === undefined ? [] : [{ entry, file: picked[index] }];
		});
		setBusy(true);
		try {
			await relinkMedia({ projectId, pairs });
			await writeProjectFolder({ projectId });
			const still = missing.filter((entry) => !plan.has(entry.id));
			setRelink(still.length ? { projectId, missing: still } : null);
			toast.success(
				`Relinked ${pairs.length} file${pairs.length === 1 ? "" : "s"} and copied ${pairs.length === 1 ? "it" : "them"} into the project folder`,
			);
			// The editor loaded before relinking; reload so the clips pick the files up.
			if (!still.length && location.pathname.includes(projectId))
				location.reload();
		} catch (error) {
			toast.error("Couldn't relink media", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog open onOpenChange={(open) => !open && setRelink(null)}>
			<DialogContent className="max-w-md" data-relink-dialog>
				<DialogHeader>
					<DialogTitle>Media missing from the project folder</DialogTitle>
				</DialogHeader>
				<p className="text-muted-foreground text-sm">
					{missing.length} file{missing.length === 1 ? " isn't" : "s aren't"} in
					the folder&apos;s media folder. Find them and they&apos;ll be copied
					in, matched by name or size.
				</p>
				<ul className="bg-accent/40 max-h-48 overflow-auto rounded-md p-2 text-xs">
					{missing.map((entry) => (
						<li key={entry.id} className="truncate py-0.5">
							{entry.name}
						</li>
					))}
				</ul>
				<input
					ref={input}
					type="file"
					multiple
					className="hidden"
					data-relink-input
					onChange={(e) => void onFiles(e.target.files)}
				/>
				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={() => setRelink(null)}>
						Skip for now
					</Button>
					<Button disabled={busy} onClick={() => input.current?.click()}>
						Find files…
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
