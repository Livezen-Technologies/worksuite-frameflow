import type { RecordedFile, SessionManifest } from "@/recording/storage";

/**
 * The recorder window hands a finished take to the main window over a
 * same-origin BroadcastChannel; the main window opens it in a new project.
 */
export const RECORDER_CHANNEL = "frameflow-recorder";

export interface OpenRecordingMessage {
	type: "open-recording";
	session: SessionManifest;
	files: RecordedFile[];
}

export function isOpenRecordingMessage(value: unknown): value is OpenRecordingMessage {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		value.type === "open-recording" &&
		"session" in value &&
		"files" in value &&
		Array.isArray(value.files)
	);
}
