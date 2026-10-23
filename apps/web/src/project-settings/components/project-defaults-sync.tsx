"use client";

import { useEffect } from "react";
import { useEditor } from "@/editor/use-editor";
import { useInputMethod } from "@/input-method/store";
import { setDefaultStillSeconds } from "@/timeline/creation";

/** Applies the open project's defaults to the editor (PS-17, PS-19). */
export function ProjectDefaultsSync() {
	const projectId = useEditor((e) => e.project.getActiveOrNull()?.metadata.id);
	const defaults = useEditor((e) => e.project.getActiveOrNull()?.settings.defaults);

	useEffect(() => {
		setDefaultStillSeconds({ seconds: defaults?.stillSeconds ?? 5 });
	}, [defaults?.stillSeconds]);

	// The typing language switches when the project opens, not on every edit.
	useEffect(() => {
		if (defaults?.inputMode) useInputMethod.getState().setMode(defaults.inputMode);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- once per project
	}, [projectId]);

	return null;
}
