"use client";

import { saveUserLottie } from "@/lottie/user-library";
import { projectToLottie } from "./export";
import type { MotionProject } from "./model";

/** Motion Studio animations live in the video editor's library under this id prefix. */
export const MOTION_LINK_PREFIX = "motion-";
const CHANNEL = "frameflow-motion-link";

export const linkedLottieId = (projectId: string) => `${MOTION_LINK_PREFIX}${projectId}`;

export function motionProjectIdOf(lottieId: string): string | null {
	return lottieId.startsWith(MOTION_LINK_PREFIX) ? lottieId.slice(MOTION_LINK_PREFIX.length) : null;
}

/**
 * Publishes the project to the video editor (Motion tab → My imports) as a
 * Lottie, under a fixed id so clips already using it update. Open editor
 * windows are told to redraw.
 */
export async function publishToVideo(project: MotionProject): Promise<string> {
	const id = linkedLottieId(project.id);
	const json = await projectToLottie(project);
	await saveUserLottie({ id, name: project.name, json });
	try {
		const channel = new BroadcastChannel(CHANNEL);
		channel.postMessage({ id, fps: json.fr, frames: json.op - json.ip, width: json.w, height: json.h });
		channel.close();
	} catch {
		// No BroadcastChannel: editors pick the change up when they reload.
	}
	return id;
}

export interface LinkMessage {
	id: string;
	fps: number;
	frames: number;
	width: number;
	height: number;
}

export function onMotionPublished(listener: (message: LinkMessage) => void): () => void {
	if (typeof BroadcastChannel === "undefined") return () => {};
	const channel = new BroadcastChannel(CHANNEL);
	channel.onmessage = (event: MessageEvent<LinkMessage>) => listener(event.data);
	return () => channel.close();
}
