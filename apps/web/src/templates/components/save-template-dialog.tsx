"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import { useT } from "@/i18n";
import { cn } from "@/utils/ui";
import { TICKS_PER_SECOND } from "@/wasm";
import { useMyProjectTemplates } from "../my-templates";
import { TEMPLATE_CATEGORIES, type TemplateCategory } from "../project-templates";
import { aspectOf, mediaClips, projectToTemplate, type SourceTrack } from "../save-template";

/** Opens "Save project as template" from the project menu or the Templates panel. */
export const useSaveTemplateDialog = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
	open: false,
	setOpen: (open) => set({ open }),
}));

/** The open sequence's tracks, bottom first (main, then overlays upwards). */
function sourceTracks(editor: EditorCore): SourceTrack[] {
	const scene = editor.scenes.getActiveSceneOrNull();
	if (!scene) return [];
	return [scene.tracks.main, ...[...scene.tracks.overlay].reverse()] as unknown as SourceTrack[];
}

/** Mounted once (project menu); saves the project as a video template in My templates. */
export function SaveTemplateDialog() {
	const t = useT();
	const editor = useEditor();
	const project = useEditor((e) => e.project.getActiveOrNull());
	const { open, setOpen } = useSaveTemplateDialog();
	const add = useMyProjectTemplates((s) => s.add);
	const [name, setName] = useState("");
	const [category, setCategory] = useState<TemplateCategory>("Promo");
	const [description, setDescription] = useState("");
	const [excluded, setExcluded] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const canvas = project?.settings.canvasSize ?? { width: 1920, height: 1080 };
	const media = open ? mediaClips(sourceTracks(editor)) : [];

	// Opened from the menu or the panel (not through the dialog): start fresh each time.
	useEffect(() => {
		if (!open) return;
		setName(project?.metadata.name ?? "");
		setDescription("");
		setExcluded([]);
	}, [open, project?.metadata.name]);
	const onOpenChange = (next: boolean) => setOpen(next);

	const save = async () => {
		setBusy(true);
		try {
			const thumbnail = (await editor.project.renderRepresentativeFrame({ maxSize: 360, quality: 0.75 }).catch(() => null)) ?? undefined;
			const template = projectToTemplate({ name, category, description, canvas, tracks: sourceTracks(editor), ticksPerSecond: TICKS_PER_SECOND, exclude: excluded, thumbnail });
			if (!template) {
				toast.error(t("Nothing to save"), { description: t("Add photos, videos, text or shapes to the timeline first.") });
				return;
			}
			add(template);
			setOpen(false);
			toast.success(t("Saved “{name}” to My templates", { name: template.name }), { description: t("Find it in Templates › My templates.") });
		} catch (error) {
			toast.error(t("Couldn't save the template"), { description: error instanceof Error ? error.message : String(error) });
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent data-save-template-dialog>
				<DialogHeader>
					<DialogTitle>{t("Save project as template")}</DialogTitle>
				</DialogHeader>
				<DialogBody className="gap-3">
					<Label htmlFor="tpl-name">{t("Name")}</Label>
					<Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("My template")} />
					<Label>{t("Category")}</Label>
					<div className="flex flex-wrap gap-1">
						{TEMPLATE_CATEGORIES.map((c) => (
							<button
								key={c}
								type="button"
								onClick={() => setCategory(c)}
								aria-pressed={category === c}
								className={cn("rounded-full border px-2 py-0.5 text-[11px]", category === c ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-accent")}
							>
								{t(c)}
							</button>
						))}
					</div>
					<Label htmlFor="tpl-desc">{t("Description (optional)")}</Label>
					<Input id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
					<p className="text-muted-foreground text-xs">
						{t("Shape: {aspect} ({width} × {height}), from the project.", { aspect: aspectOf(canvas).label, width: canvas.width, height: canvas.height })}
					</p>
					{media.length > 0 && (
						<div className="flex flex-col gap-1">
							<Label>{t("Replaceable media")}</Label>
							<p className="text-muted-foreground text-[11px]">{t("Ticked photos and videos become slots that are filled with your media when the template is used; unticked ones are left out. Text stays editable.")}</p>
							<div className="flex max-h-36 flex-col gap-0.5 overflow-auto rounded border p-1.5">
								{media.map((m) => (
									<label key={m.id} className="flex items-center gap-2 text-xs">
										<input
											type="checkbox"
											className="accent-primary size-3.5"
											checked={!excluded.includes(m.id)}
											onChange={(e) => setExcluded((x) => (e.target.checked ? x.filter((id) => id !== m.id) : [...x, m.id]))}
										/>
										<span className="truncate">{m.name}</span>
									</label>
								))}
							</div>
						</div>
					)}
					<p className="text-muted-foreground text-[11px]">{t("Saved on this device. Audio, effects and animations aren't part of a template.")}</p>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						{t("Cancel")}
					</Button>
					<Button disabled={busy || !project} onClick={() => void save()} data-save-template>
						{busy ? t("Saving…") : t("Save template")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
