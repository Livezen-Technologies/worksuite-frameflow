"use client";

import { useEffect } from "react";
import {
	FolderOpen,
	FolderInput,
	FolderX,
	HardDriveDownload,
} from "lucide-react";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { foldersBridge } from "../bridge";
import { useProjectFolders } from "../store";
import {
	moveProjectFolder,
	refreshFolderLink,
	saveAsProjectFolder,
	stopSavingToFolder,
} from "../sync";

const fail = (title: string) => (error: unknown) =>
	toast.error(title, {
		description: error instanceof Error ? error.message : String(error),
	});

/** "Save as project folder" and friends, for the project menu. */
export function FolderMenuItems({ projectId }: { projectId: string | null }) {
	const path = useProjectFolders((s) =>
		projectId ? s.links[projectId] : undefined,
	);
	const status = useProjectFolders((s) =>
		projectId ? s.status[projectId] : undefined,
	);
	useEffect(() => {
		if (projectId) void refreshFolderLink({ projectId });
	}, [projectId]);
	if (!projectId || !foldersBridge()) return null;

	if (!path)
		return (
			<DropdownMenuItem
				data-save-folder
				className="gap-2.5 px-3"
				onSelect={() =>
					void saveAsProjectFolder({ projectId })
						.then(
							(saved) =>
								saved &&
								toast.success("Project saved as a folder", {
									description: saved,
								}),
						)
						.catch(fail("Couldn't save the project folder"))
				}
			>
				<HardDriveDownload className="size-4" /> Save as project folder…
			</DropdownMenuItem>
		);

	return (
		<>
			<DropdownMenuItem
				className="gap-2.5 px-3"
				title={path}
				onSelect={() => void foldersBridge()?.show({ projectId })}
			>
				<FolderOpen className="size-4" /> Show in folder
				<span className="text-muted-foreground ml-auto text-[10px]">
					{status === "saving"
						? "Saving…"
						: status === "error"
							? "Not saved"
							: "Saved"}
				</span>
			</DropdownMenuItem>
			<DropdownMenuItem
				className="gap-2.5 px-3"
				onSelect={() =>
					void moveProjectFolder({ projectId })
						.then(
							(moved) =>
								moved &&
								toast.success("Project folder moved", { description: moved }),
						)
						.catch(fail("Couldn't move the project folder"))
				}
			>
				<FolderInput className="size-4" /> Move project folder…
			</DropdownMenuItem>
			<DropdownMenuItem
				className="gap-2.5 px-3"
				onSelect={() =>
					void stopSavingToFolder({ projectId }).then(() =>
						toast("This project no longer saves to its folder", {
							description: "The folder and its files are left as they are.",
						}),
					)
				}
			>
				<FolderX className="size-4" /> Stop saving to folder
			</DropdownMenuItem>
		</>
	);
}
