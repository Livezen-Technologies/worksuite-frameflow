/** One camera, phone or screen recording in a multicam clip (SRS SC-24). */
export interface MulticamAngle {
	mediaId: string;
	name: string;
	/** Seconds after the group's zero point that this angle starts. */
	offset: number;
	/** Source length in seconds. */
	duration: number;
}

export interface MulticamGroup {
	id: string;
	name: string;
	angles: MulticamAngle[];
	/** Audio follows the visible angle, or always comes from one angle (SC-27). */
	audio: "follow" | number;
	/** Group length in seconds (end of the latest angle). */
	length: number;
	/** How the angles were lined up (SC-25). */
	sync: "audio" | "start" | "manual";
}

/** Stored on every clip of a multicam clip; the group copy is the same on all of them. */
export interface MulticamTag {
	groupId: string;
	angle: number;
	/** "audio": the hidden clip that carries the chosen angle's sound. */
	role?: "audio";
	/** Group time (seconds) at the timeline start of the group. */
	group: MulticamGroup;
	/** Timeline seconds where group time 0 sits. */
	start: number;
}

export interface MulticamCut {
	/** Group seconds where this angle takes over. */
	at: number;
	angle: number;
}

export const MAX_ANGLES = 9;
export const MIN_ANGLES = 2;
