"use client";

import { useSyncExternalStore } from "react";
import { FolderOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { foldersBridge } from "../bridge";
import { openProjectFolder } from "../sync";

const noSubscribe = () => () => {};

/** Projects page: open a .ffproj folder from disk. */
export function OpenFolderButton() {
	const router = useRouter();
	// The bridge only exists in the desktop app; check after mount so server and client HTML match.
	const available = useSyncExternalStore(
		noSubscribe,
		() => !!foldersBridge(),
		() => false,
	);
	if (!available) return null;
	return (
		<Button
			size="lg"
			variant="outline"
			className="px-4"
			data-open-folder
			onClick={() =>
				void openProjectFolder()
					.then(
						(opened) => opened && router.push(`/editor/${opened.projectId}`),
					)
					.catch((error: unknown) =>
						toast.error("Couldn't open the project folder", {
							description:
								error instanceof Error ? error.message : String(error),
						}),
					)
			}
		>
			<FolderOpen className="size-4" />
			<span className="hidden text-sm font-medium md:block">Open folder</span>
		</Button>
	);
}
