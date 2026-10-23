"use client";

import { Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMulticamUi } from "../store";
import { AngleViewer } from "./angle-viewer";
import { CreateMulticamDialog } from "./create-multicam-dialog";

/** Timeline toolbar: make a multicam clip; also hosts the dialog and angle viewer. */
export function MulticamButton() {
	return (
		<>
			<Button
				variant="outline"
				size="sm"
				className="h-7 gap-1 px-2 text-xs"
				title="Make a multicam clip from several camera angles"
				data-multicam-button
				onClick={() => useMulticamUi.getState().setCreateOpen(true)}
			>
				<Clapperboard className="size-3.5" />
				Multicam
			</Button>
			<CreateMulticamDialog />
			<AngleViewer />
		</>
	);
}
