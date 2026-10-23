import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type {
	SceneTracks,
	TimelineElement,
	TimelineTrack,
	VideoElement,
} from "@/timeline/types";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { buildEmptyTrack } from "@/timeline/placement";
import { generateUUID } from "@/utils/id";
import { mediaTimeFromSeconds, roundMediaTime } from "@/wasm";
import type { CutSpan } from "./cuts";
import type { MulticamGroup, MulticamTag } from "./types";

const ticks = (seconds: number) =>
	roundMediaTime({ time: mediaTimeFromSeconds({ seconds }) });

const tagOf = (element: TimelineElement): MulticamTag | undefined =>
	element.type === "video" ? element.multicam : undefined;

/** Video clips for a group's spans (plus the hidden audio carrier when audio is fixed). */
export function buildGroupElements({
	group,
	spans,
	start,
	keep,
}: {
	group: MulticamGroup;
	spans: CutSpan[];
	/** Timeline seconds of group time 0. */
	start: number;
	/** Settings to keep per angle (grade, transform) from the clips being replaced. */
	keep: Map<number, Pick<VideoElement, "effects" | "params">>;
}): { cuts: VideoElement[]; audio: VideoElement | null } {
	const fixedAudio = typeof group.audio === "number" ? group.audio : null;
	const cuts = spans.map((span) => {
		const angle = group.angles[span.angle];
		const base = buildElementFromMedia({
			mediaId: angle.mediaId,
			mediaType: "video",
			name: `${group.name} · ${angle.name}`,
			duration: ticks(span.end - span.start),
			startTime: ticks(start + span.start),
		});
		const kept = keep.get(span.angle);
		const source = ticks(angle.duration);
		const trimStart = ticks(span.start - angle.offset);
		const element = {
			...base,
			id: generateUUID(),
			sourceDuration: source,
			trimStart,
			trimEnd: Math.max(0, source - trimStart - ticks(span.end - span.start)),
			...(kept?.effects ? { effects: kept.effects } : {}),
			params: {
				...base.params,
				...(kept?.params ?? {}),
				...(fixedAudio !== null ? { muted: true } : {}),
			},
			multicam: { groupId: group.id, angle: span.angle, group, start },
		};
		// buildElementFromMedia gives a video element here.
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		return element as VideoElement;
	});
	let audio: VideoElement | null = null;
	if (fixedAudio !== null && group.angles[fixedAudio]) {
		const a = group.angles[fixedAudio];
		const base = buildElementFromMedia({
			mediaId: a.mediaId,
			mediaType: "video",
			name: `${group.name} · audio (${a.name})`,
			duration: ticks(a.duration),
			startTime: ticks(start + a.offset),
		});
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		audio = {
			...base,
			id: generateUUID(),
			hidden: true,
			multicam: {
				groupId: group.id,
				angle: fixedAudio,
				role: "audio",
				group,
				start,
			},
		} as VideoElement;
	}
	return { cuts, audio };
}

/**
 * Replace a multicam group's clips with new spans in one undo step. Cuts
 * go on the track the group already uses (a new top video track for a new
 * group); the audio carrier gets its own hidden-video track.
 */
export class ApplyMulticamCommand extends Command {
	private saved: SceneTracks | null = null;

	constructor(
		private readonly args: {
			group: MulticamGroup;
			spans: CutSpan[];
			start: number;
		},
	) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const tracks = editor.scenes.getActiveScene().tracks;
		this.saved = tracks;
		const { group, spans, start } = this.args;

		// Per-angle settings survive a rebuild: the first clip of each angle wins.
		const keep = new Map<number, Pick<VideoElement, "effects" | "params">>();
		let cutTrackId: string | null = null;
		let audioTrackId: string | null = null;
		const all: TimelineTrack[] = [
			...tracks.overlay,
			tracks.main,
			...tracks.audio,
		];
		for (const track of all) {
			for (const element of track.elements) {
				const tag = tagOf(element);
				if (tag?.groupId !== group.id || element.type !== "video") continue;
				if (tag.role === "audio") audioTrackId = track.id;
				else {
					cutTrackId ??= track.id;
					if (!keep.has(tag.angle)) {
						const { muted: _muted, ...params } = element.params;
						keep.set(tag.angle, { effects: element.effects, params });
					}
				}
			}
		}
		const { cuts, audio } = buildGroupElements({ group, spans, start, keep });
		const strip = <T extends TimelineTrack>(track: T): T =>
			// Same track, fewer elements.

			({
				...track,
				elements: track.elements.filter((e) => tagOf(e)?.groupId !== group.id),
			}) as T;

		let overlay = tracks.overlay.map(strip);
		let main = strip(tracks.main);
		const place = ({
			trackId,
			elements,
		}: {
			trackId: string | null;
			elements: VideoElement[];
		}) => {
			if (!elements.length) return;
			if (trackId === main.id) {
				main = { ...main, elements: [...main.elements, ...elements] };
				return;
			}
			let placed = false;
			overlay = overlay.map((t) => {
				if (t.id !== trackId || t.type !== "video") return t;
				placed = true;
				return { ...t, elements: [...t.elements, ...elements] };
			});
			if (!placed) {
				const track = buildEmptyTrack({ id: generateUUID(), type: "video" });
				overlay = [{ ...track, elements }, ...overlay];
			}
		};
		place({ trackId: cutTrackId, elements: cuts });
		if (audio) place({ trackId: audioTrackId, elements: [audio] });
		editor.timeline.updateTracks({
			...tracks,
			overlay,
			main,
			audio: tracks.audio,
		});
		return undefined;
	}

	undo(): void {
		if (this.saved) EditorCore.getInstance().timeline.updateTracks(this.saved);
	}
}
