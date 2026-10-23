"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addToLibrary } from "@/cloud/library";
import type { EditorCore } from "@/core";
import { newPack, PACK_FILE_SUFFIX, packToFile, parsePackFile, useCustomPacks } from "../custom";
import { templateFromSelection } from "../save-selection";
import { usePackStore } from "../store";
import type { AspectId, Pack } from "../types";

const isCustom = (pack: Pack) => pack.id.startsWith("custom-");

function download({ file }: { file: File }) {
	const url = URL.createObjectURL(file);
	const a = document.createElement("a");
	a.href = url;
	a.download = file.name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** New / import, and for your own packs: save selection, export, share (SP-11). */
export function CustomPackBar({ editor, pack, aspect }: { editor: EditorCore; pack: Pack; aspect: AspectId }) {
	const custom = useCustomPacks();
	const setPack = usePackStore((s) => s.setPack);
	const fileRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const cloud = typeof window !== "undefined" ? window.worksuite?.cloud : undefined;

	// Electron has no window.prompt: names are typed in a small field here.
	const [naming, setNaming] = useState<"pack" | "template" | null>(null);
	const [name, setName] = useState("");
	const create = ({ name }: { name: string }) => {
		const made = newPack({ name });
		custom.add(made);
		setPack(made.id);
	};
	const saveSelection = ({ name }: { name: string }) => {
		const template = templateFromSelection({ editor, pack, name, aspect });
		if (!template) {
			toast.info("Select titles or shapes on the timeline first.");
			return;
		}
		custom.addTemplate({ packId: pack.id, template });
		toast.success(`Saved “${template.name}” to ${pack.name}`, {
			description: `${template.layers.length} layer${template.layers.length === 1 ? "" : "s"}; it fits every aspect of the pack.`,
		});
	};
	const importFile = async (file: File) => {
		try {
			const imported = parsePackFile({ text: await file.text() });
			custom.add(imported);
			setPack(imported.id);
			toast.success(`Added the pack “${imported.name}”`);
		} catch (error) {
			toast.error("Couldn't add that pack", { description: error instanceof Error ? error.message : String(error) });
		}
	};
	const share = async () => {
		setBusy(true);
		try {
			await addToLibrary({ file: packToFile({ pack }), scope: "team", folderId: null });
			toast.success(`Shared “${pack.name}” with your team`, {
				description: "Teammates add it from Text → Packs → Team packs.",
			});
		} catch (error) {
			toast.error("Couldn't share the pack", { description: error instanceof Error ? error.message : String(error) });
		} finally {
			setBusy(false);
		}
	};
	const teamPacks = async () => {
		if (!cloud) return;
		setBusy(true);
		try {
			const listed = await cloud.sync("listLibrary", { scope: "team", folderId: null });
			if (!listed.ok) throw new Error(listed.message);
			const files = listed.value.items.filter((i) => i.name.endsWith(PACK_FILE_SUFFIX));
			let added = 0;
			for (const item of files) {
				const data = await cloud.sync("downloadAsset", { assetId: item.assetId });
				if (!data.ok) continue;
				try {
					custom.add(parsePackFile({ text: new TextDecoder().decode(data.value) }));
					added++;
				} catch {
					// Not a pack after all: skip it.
				}
			}
			toast.success(added ? `Added ${added} team pack${added === 1 ? "" : "s"}` : "Your team hasn't shared any packs yet.");
		} catch (error) {
			toast.error("Couldn't load team packs", { description: error instanceof Error ? error.message : String(error) });
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex flex-wrap items-center gap-1" data-custom-packs>
			{naming && (
				<form
					className="flex w-full items-center gap-1"
					onSubmit={(e) => {
						e.preventDefault();
						if (naming === "pack") create({ name });
						else saveSelection({ name });
						setNaming(null);
					}}
				>
					<Input
						ref={(el) => el?.focus()}
						className="h-7 flex-1 text-xs"
						placeholder={naming === "pack" ? "Pack name" : "Template name"}
						value={name}
						onChange={(e) => setName(e.target.value)}
						data-pack-name-input
					/>
					<Button type="submit" size="sm" className="h-7 text-xs" data-pack-name-ok>
						{naming === "pack" ? "Create" : "Save"}
					</Button>
					<Button type="button" size="sm" variant="text" className="h-7 text-xs" onClick={() => setNaming(null)}>
						Cancel
					</Button>
				</form>
			)}
			<Button
				size="sm"
				variant="outline"
				className="h-7 text-xs"
				onClick={() => {
					setName("My pack");
					setNaming("pack");
				}}
				data-new-pack
			>
				+ New pack
			</Button>
			<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => fileRef.current?.click()}>
				Import…
			</Button>
			{cloud && (
				<Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void teamPacks()}>
					Team packs
				</Button>
			)}
			{isCustom(pack) && (
				<>
					<Button
						size="sm"
						className="h-7 text-xs"
						onClick={() => {
							setName("My template");
							setNaming("template");
						}}
						data-save-selection
					>
						Save selection as template
					</Button>
					<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => download({ file: packToFile({ pack }) })} data-export-pack>
						Export
					</Button>
					{cloud && (
						<Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void share()}>
							Share with team
						</Button>
					)}
					<Button
						size="sm"
						variant="text"
						className="h-7 text-xs"
						onClick={() => {
							if (!window.confirm(`Delete the pack “${pack.name}” from this device?`)) return;
							custom.remove(pack.id);
							setPack("youtube");
						}}
					>
						Delete pack
					</Button>
				</>
			)}
			<input
				ref={fileRef}
				type="file"
				accept=".json,application/json"
				className="hidden"
				data-import-pack
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = "";
					if (file) void importFile(file);
				}}
			/>
		</div>
	);
}
