"use client";

import { useEffect, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { buildLibraryAudioElement } from "@/timeline/element-utils";
import { mediaTimeFromSeconds, roundMediaTime } from "@/wasm";
import { onPackContentChange, packSounds, type PackSound } from "../registry";
import { AssetLibraryButton } from "./asset-library-button";

/** Sounds → Packs: sounds from installed sound packs. */
export function InstalledPackSounds() {
	const editor = useEditor();
	const [sounds, setSounds] = useState<PackSound[]>(() => packSounds());
	useEffect(() => onPackContentChange(() => setSounds(packSounds())), []);

	const add = async (sound: PackSound) => {
		let seconds = 1;
		try {
			const audio = new Audio(sound.url);
			await new Promise<void>((resolve, reject) => {
				audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
				audio.addEventListener("error", () => reject(new Error("load")), { once: true });
			});
			seconds = audio.duration || 1;
		} catch {
			// Keep one second.
		}
		const element = buildLibraryAudioElement({
			sourceUrl: sound.url,
			name: sound.name,
			duration: roundMediaTime({ time: mediaTimeFromSeconds({ seconds }) }),
			startTime: editor.playback.getCurrentTime(),
		});
		editor.timeline.insertElement({ element, placement: { mode: "auto", trackType: "audio" } });
	};

	return (
		<div className="flex flex-col gap-2">
			<AssetLibraryButton type="sounds" />
			{sounds.length === 0 ? (
				<p className="text-muted-foreground text-xs">No sound packs installed yet. The built-in sound effects come with animations.</p>
			) : (
				sounds.map((sound) => (
					<div key={sound.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-accent">
						<span>
							{sound.name} <span className="text-muted-foreground text-xs">· {sound.packTitle}</span>
						</span>
						<button type="button" className="text-primary text-xs" onClick={() => void add(sound)}>
							+ Add
						</button>
					</div>
				))
			)}
		</div>
	);
}
