"use client";

import { ArrowLeft, Circle, ImagePlus, PenTool, Redo2, Square, Star, Type, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BrandLoader } from "@/components/brand-loader";
import { cn } from "@/utils/ui";
import { copyKeyframes, createLayer, newId, pasteKeyframes, removeKeyframe, type Layer } from "../model";
import { loadMotionProject, saveMotionProject } from "../storage";
import { useStudio } from "../store";
import { MotionCanvas, type Tool } from "./canvas";
import { LayersPanel } from "./layers-panel";
import { MotionTimeline } from "./motion-timeline";
import { PropertiesPanel } from "./properties-panel";

function readAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

async function imageLayer({ file, width, height }: { file: File; width: number; height: number }): Promise<Layer> {
	const src = await readAsDataUrl(file);
	const size = await new Promise<{ w: number; h: number }>((resolve) => {
		const img = new Image();
		img.onload = () => resolve({ w: img.naturalWidth || 512, h: img.naturalHeight || 512 });
		img.onerror = () => resolve({ w: 512, h: 512 });
		img.src = src;
	});
	const fit = Math.min(1, (width * 0.6) / size.w, (height * 0.6) / size.h);
	return {
		id: newId(),
		name: file.name.replace(/\.[^.]+$/, ""),
		visible: true,
		locked: false,
		x: width / 2,
		y: height / 2,
		scale: Math.round(fit * 1000) / 1000,
		rotation: 0,
		opacity: 1,
		anchorX: 0.5,
		anchorY: 0.5,
		keyframes: {},
		kind: "image",
		src,
		w: size.w,
		h: size.h,
	};
}

const isTyping = (target: EventTarget | null) =>
	target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);

/** The Motion Studio editor for one project. */
export function MotionStudio({ projectId }: { projectId: string }) {
	const project = useStudio((s) => s.project);
	const canUndo = useStudio((s) => s.past.length > 0);
	const canRedo = useStudio((s) => s.future.length > 0);
	const [missing, setMissing] = useState(false);
	const [savedAt, setSavedAt] = useState(0);
	const [tool, setTool] = useState<Tool>("select");
	const fileRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		let cancelled = false;
		loadMotionProject(projectId).then((p) => {
			if (cancelled) return;
			if (p) useStudio.getState().load(p);
			else setMissing(true);
		});
		return () => {
			cancelled = true;
		};
	}, [projectId]);

	// Autosave shortly after each change; also on leaving.
	useEffect(() => {
		if (!project || project.id !== projectId) return;
		const timer = setTimeout(() => {
			void saveMotionProject(project).then(() => setSavedAt(project.updatedAt));
		}, 400);
		return () => clearTimeout(timer);
	}, [project, projectId]);
	useEffect(() => {
		const flush = () => {
			const p = useStudio.getState().project;
			if (p) void saveMotionProject(p);
		};
		window.addEventListener("beforeunload", flush);
		return () => {
			window.removeEventListener("beforeunload", flush);
			flush();
		};
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (isTyping(e.target)) return;
			const s = useStudio.getState();
			const mod = e.ctrlKey || e.metaKey;
			const key = e.key.toLowerCase();
			if (mod && key === "z") {
				e.preventDefault();
				if (e.shiftKey) s.redo();
				else s.undo();
			} else if (mod && key === "y") {
				e.preventDefault();
				s.redo();
			} else if (mod && key === "c" && s.keySelection.length && s.project) {
				e.preventDefault();
				s.setKeyClipboard(copyKeyframes({ layers: s.project.layers, keys: s.keySelection }));
				toast.success(`Copied ${s.keySelection.length} keyframe${s.keySelection.length === 1 ? "" : "s"}`);
			} else if (mod && key === "v" && s.keyClipboard.length && s.project) {
				e.preventDefault();
				const target = s.selection.length === 1 ? s.selection[0] : undefined;
				const result = pasteKeyframes({ layers: s.project.layers, copied: s.keyClipboard, t: s.time, duration: s.project.duration, target });
				s.commit((p) => ({ ...p, layers: result.layers }));
				s.setKeySelection(result.keys);
			} else if ((e.key === "Delete" || e.key === "Backspace") && s.keySelection.length) {
				e.preventDefault();
				const keys = s.keySelection;
				s.commit((p) => ({
					...p,
					layers: p.layers.map((l) => keys.filter((k) => k.layerId === l.id).reduce((acc, k) => removeKeyframe({ layer: acc, prop: k.prop, t: k.t }), l)),
				}));
				s.setKeySelection([]);
			} else if (mod && key === "d" && s.selection.length) {
				e.preventDefault();
				const copies = s.project?.layers.filter((l) => s.selection.includes(l.id)).map((l) => ({ ...l, id: newId(), name: `${l.name} copy`, x: l.x + 20, y: l.y + 20 })) ?? [];
				s.commit((p) => ({ ...p, layers: [...p.layers, ...copies] }));
				s.select(copies.map((c) => c.id));
			} else if (mod && key === "a") {
				e.preventDefault();
				s.select(s.project?.layers.filter((l) => !l.locked).map((l) => l.id) ?? []);
			} else if ((e.key === "Delete" || e.key === "Backspace") && s.selection.length) {
				e.preventDefault();
				s.commit((p) => ({ ...p, layers: p.layers.filter((l) => !s.selection.includes(l.id)) }));
				s.select([]);
			} else if (e.key === "Escape") {
				if (s.keySelection.length) s.setKeySelection([]);
				else if (s.editingPath) s.setEditingPath(null);
				else s.select([]);
				setTool("select");
			} else if (e.key === "Enter" && s.editingPath) {
				s.setEditingPath(null);
				setTool("select");
			} else if (e.key === " " && !mod) {
				e.preventDefault();
			} else if (key === "k" && !mod) {
				s.setPlaying(!s.playing);
			} else if (key === "p" && !mod) {
				setTool("pen");
				s.select([]);
			} else if (key === "v" && !mod) {
				setTool("select");
			} else if (e.key.startsWith("Arrow") && s.selection.length) {
				e.preventDefault();
				const step = e.shiftKey ? 10 : 1;
				const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
				const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
				s.commit((p) => ({
					...p,
					layers: p.layers.map((l) => (s.selection.includes(l.id) && !l.locked ? { ...l, x: l.x + dx, y: l.y + dy } : l)),
				}));
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	if (missing)
		return (
			<div className="flex h-screen flex-col items-center justify-center gap-3">
				<p>This motion project wasn&apos;t found on this device.</p>
				<Link href="/motion" className="text-primary">
					Back to Motion Studio
				</Link>
			</div>
		);
	if (!project || project.id !== projectId)
		return (
			<div className="flex h-screen items-center justify-center">
				<BrandLoader size={96} />
			</div>
		);

	const add = (kind: "rect" | "ellipse" | "text" | "star") => {
		const s = useStudio.getState();
		const layer = createLayer({ kind, project });
		s.commit((p) => ({ ...p, layers: [...p.layers, layer] }));
		s.select([layer.id]);
		setTool("select");
	};
	const importFiles = async (files: File[]) => {
		const s = useStudio.getState();
		for (const file of files) {
			try {
				const layer = await imageLayer({ file, width: project.width, height: project.height });
				s.commit((p) => ({ ...p, layers: [...p.layers, layer] }));
				s.select([layer.id]);
			} catch {
				toast.error(`Couldn't add ${file.name}`);
			}
		}
	};
	const saved = savedAt >= project.updatedAt || useStudio.getState().past.length === 0 ? "saved" : "saving";
	const toolButton = "hover:bg-accent flex items-center gap-1.5 px-2 py-1 text-xs";

	return (
		<div
			className="bg-background text-foreground flex h-screen flex-col"
			data-motion-studio
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				const files = [...e.dataTransfer.files].filter((f) => /^image\//.test(f.type) || /\.svg$/i.test(f.name));
				if (files.length) void importFiles(files);
			}}
		>
			<header className="flex items-center gap-2 border-b px-2 py-1.5">
				<Link href="/motion" className="text-muted-foreground hover:text-foreground p-1" aria-label="Back to Motion Studio">
					<ArrowLeft className="size-4" />
				</Link>
				<input
					value={project.name}
					onChange={(e) => useStudio.getState().commit((p) => ({ ...p, name: e.target.value }))}
					className="hover:bg-muted/50 focus:bg-muted/50 h-7 w-56 bg-transparent px-2 text-sm font-medium"
					aria-label="Project name"
					data-motion-name
				/>
				<div className="mx-2 flex items-center border">
					<button type="button" className={cn(toolButton, tool === "select" && "bg-accent")} onClick={() => setTool("select")} title="Select (V)">
						Select
					</button>
					<button type="button" className={toolButton} onClick={() => add("rect")} data-motion-add="rect">
						<Square className="size-3.5" /> Rectangle
					</button>
					<button type="button" className={toolButton} onClick={() => add("ellipse")} data-motion-add="ellipse">
						<Circle className="size-3.5" /> Ellipse
					</button>
					<button type="button" className={toolButton} onClick={() => add("star")} data-motion-add="star">
						<Star className="size-3.5" /> Star
					</button>
					<button type="button" className={toolButton} onClick={() => add("text")} data-motion-add="text">
						<Type className="size-3.5" /> Text
					</button>
					<button
						type="button"
						className={cn(toolButton, tool === "pen" && "bg-accent")}
						onClick={() => {
							setTool("pen");
							useStudio.getState().select([]);
						}}
						title="Pen (P): click to add points, drag for curves, click the first point to close, Enter to finish"
						data-motion-add="pen"
					>
						<PenTool className="size-3.5" /> Pen
					</button>
					<button type="button" className={toolButton} onClick={() => fileRef.current?.click()} data-motion-add="image">
						<ImagePlus className="size-3.5" /> Image / SVG
					</button>
					<input
						ref={fileRef}
						type="file"
						accept="image/*,.svg"
						multiple
						className="hidden"
						onChange={(e) => {
							const files = [...(e.target.files ?? [])];
							e.target.value = "";
							void importFiles(files);
						}}
					/>
				</div>
				<button type="button" className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-30" disabled={!canUndo} onClick={() => useStudio.getState().undo()} aria-label="Undo" title="Undo (Ctrl+Z)">
					<Undo2 className="size-4" />
				</button>
				<button type="button" className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-30" disabled={!canRedo} onClick={() => useStudio.getState().redo()} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
					<Redo2 className="size-4" />
				</button>
				<span className="text-muted-foreground ml-auto text-[11px]" data-motion-saved={saved}>
					{saved === "saved" ? "Saved on this device" : "Saving…"}
				</span>
			</header>
			<div className="flex min-h-0 flex-1">
				<aside className="w-56 shrink-0 border-r">
					<LayersPanel />
				</aside>
				<main className="min-w-0 flex-1">
					<MotionCanvas tool={tool} setTool={setTool} />
				</main>
				<aside className="w-64 shrink-0 border-l">
					<PropertiesPanel />
				</aside>
			</div>
			<footer className="h-60 shrink-0 border-t">
				<MotionTimeline />
			</footer>
		</div>
	);
}
