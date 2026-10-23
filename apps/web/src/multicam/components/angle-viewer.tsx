"use client";

import { useEffect, useMemo, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { proxyFileFor } from "@/proxy/registry";
import { cn } from "@/utils/ui";
import { TICKS_PER_SECOND } from "@/wasm";
import { finishLive, liveCut, readGroup, switchAngle } from "../service";
import { useMulticamUi } from "../store";

/**
 * Angle viewer (SC-26): every angle playing in sync with the timeline.
 * Click an angle, or press 1–9: while playing it cuts there (live
 * switching); while paused it changes the cut under the playhead (SC-27).
 * Plays proxies when there are any (SC-30).
 */
export function AngleViewer() {
	const groupId = useMulticamUi((s) => s.viewerGroupId);
	const close = () => useMulticamUi.getState().openViewer(null);
	const editor = useEditor();
	// Re-read when the timeline changes so the highlight follows the cuts.
	const tracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const current = useMemo(
		() => (groupId && tracks ? readGroup({ editor, groupId }) : null),
		[editor, groupId, tracks],
	);
	const assets = useEditor((e) => e.media.getAssets());
	const videos = useRef<(HTMLVideoElement | null)[]>([]);
	const group = current?.tag.group ?? null;
	const urls = useMemo(() => {
		if (!group) return [];
		return group.angles.map((a) => {
			const proxy = proxyFileFor(a.mediaId);
			if (proxy) return URL.createObjectURL(proxy);
			return assets.find((m) => m.id === a.mediaId)?.url ?? "";
		});
	}, [group, assets]);
	useEffect(
		() => () =>
			urls.forEach((u) => u.startsWith("blob:") && URL.revokeObjectURL(u)),
		[urls],
	);

	// Stopping playback closes a live switching pass.
	useEffect(() => {
		if (!groupId) return;
		let wasPlaying = editor.playback.getIsPlaying();
		const timer = window.setInterval(() => {
			const playing = editor.playback.getIsPlaying();
			if (wasPlaying && !playing) finishLive({ editor, groupId });
			wasPlaying = playing;
		}, 100);
		return () => window.clearInterval(timer);
	}, [editor, groupId]);

	// Keep every angle at the playhead.
	useEffect(() => {
		if (!current) return;
		let frame = 0;
		const tick = () => {
			const t =
				editor.playback.getCurrentTime() / TICKS_PER_SECOND - current.tag.start;
			const playing = editor.playback.getIsPlaying();
			current.tag.group.angles.forEach((a, i) => {
				const v = videos.current[i];
				if (!v) return;
				const local = t - a.offset;
				const inside = local >= 0 && local < a.duration;
				v.style.opacity = inside ? "1" : "0.25";
				if (!inside) {
					if (!v.paused) v.pause();
					return;
				}
				if (Math.abs(v.currentTime - local) > (playing ? 0.25 : 0.04))
					v.currentTime = local;
				if (playing && v.paused) void v.play().catch(() => {});
				if (!playing && !v.paused) v.pause();
			});
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [current, editor]);

	const pick = (angle: number) => {
		if (!groupId) return;
		if (editor.playback.getIsPlaying()) liveCut({ editor, groupId, angle });
		else switchAngle({ editor, groupId, angle });
	};

	useEffect(() => {
		if (!group) return;
		const onKey = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			)
				return;
			const n = Number(e.key);
			if (
				n >= 1 &&
				n <= group.angles.length &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey
			) {
				e.preventDefault();
				e.stopPropagation();
				pick(n - 1);
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	});

	if (!groupId || !current || !group) return null;
	const at =
		editor.playback.getCurrentTime() / TICKS_PER_SECOND - current.tag.start;
	const live =
		current.spans.find((s) => s.start <= at && at < s.end)?.angle ?? -1;
	const cols = group.angles.length <= 4 ? 2 : 3;

	return (
		<div
			className="bg-background/95 fixed right-4 bottom-4 z-40 w-[440px] rounded-xl border p-2 shadow-2xl"
			data-angle-viewer
		>
			<div className="mb-2 flex items-center justify-between px-1">
				<span className="text-sm font-medium">{group.name} · angles</span>
				<span className="text-muted-foreground text-[11px]">
					Click or press 1–{group.angles.length}
				</span>
				<Button
					size="icon"
					variant="ghost"
					className="size-6"
					aria-label="Close angle viewer"
					onClick={close}
				>
					<X className="size-4" />
				</Button>
			</div>
			<div
				className={cn(
					"grid gap-1.5",
					cols === 2 ? "grid-cols-2" : "grid-cols-3",
				)}
			>
				{group.angles.map((a, i) => (
					<button
						key={a.mediaId + i}
						type="button"
						data-angle={i + 1}
						aria-pressed={live === i}
						onClick={() => pick(i)}
						className={cn(
							"relative aspect-video overflow-hidden rounded-md border-2 bg-black",
							live === i
								? "border-red-500"
								: "border-transparent hover:border-sky-500",
						)}
					>
						<video
							ref={(el) => {
								videos.current[i] = el;
							}}
							src={urls[i]}
							muted
							playsInline
							preload="auto"
							className="size-full object-contain"
						/>
						<span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 text-[11px] text-white">
							{i + 1} · {a.name}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}
