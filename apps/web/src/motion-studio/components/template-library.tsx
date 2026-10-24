"use client";

import { Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/ui";
import { deleteMotionTemplate, listMotionTemplates, saveMotionProject, type SavedTemplate } from "../storage";
import { BUILT_IN_TEMPLATES, cloneProject, searchTemplates, TEMPLATE_CATEGORIES, type MotionTemplate } from "../templates";
import { StageThumbnail } from "./stage";

/** Plays the template while hovered; shows a mid-animation frame otherwise. */
function TemplatePreview({ template }: { template: MotionTemplate }) {
	const project = useMemo(() => template.build(), [template]);
	const [t, setT] = useState(Math.min(1.5, project.duration * 0.6));
	const frame = useRef(0);
	const play = () => {
		const start = performance.now();
		const tick = (now: number) => {
			setT(((now - start) / 1000) % project.duration);
			frame.current = requestAnimationFrame(tick);
		};
		frame.current = requestAnimationFrame(tick);
	};
	const stop = () => {
		cancelAnimationFrame(frame.current);
		setT(Math.min(1.5, project.duration * 0.6));
	};
	useEffect(() => () => cancelAnimationFrame(frame.current), []);
	return (
		<div
			className="flex aspect-video items-center justify-center overflow-hidden bg-[repeating-conic-gradient(#1a1d24_0%_25%,#14171d_0%_50%)] bg-[length:16px_16px]"
			onPointerEnter={play}
			onPointerLeave={stop}
		>
			<StageThumbnail project={project} t={t} className="max-h-full max-w-full" />
		</div>
	);
}

/** Searchable motion templates by category, plus the user's saved templates. */
export function TemplateLibrary() {
	const router = useRouter();
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<string | null>(null);
	const [saved, setSaved] = useState<SavedTemplate[]>([]);
	useEffect(() => {
		listMotionTemplates()
			.then(setSaved)
			.catch(() => {});
	}, []);
	const mine: MotionTemplate[] = saved.map((s) => ({ id: s.id, name: s.name, category: "My templates", tags: [], build: () => s.project }));
	const all = [...mine, ...BUILT_IN_TEMPLATES];
	const shown = searchTemplates({ templates: all, query, category });
	const use = async (template: MotionTemplate) => {
		const project = cloneProject({ source: template.build() });
		await saveMotionProject(project);
		router.push(`/motion/${project.id}`);
	};
	const chips = [null, ...(mine.length ? ["My templates"] : []), ...TEMPLATE_CATEGORIES];
	return (
		<section data-motion-templates>
			<div className="mb-3 flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold">Templates</h2>
				<label className="bg-muted/50 flex h-8 w-64 items-center gap-2 border px-2">
					<Search className="text-muted-foreground size-3.5" />
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search templates"
						className="min-w-0 flex-1 bg-transparent text-sm outline-none"
						data-motion-template-search
					/>
				</label>
			</div>
			<div className="mb-3 flex flex-wrap gap-1">
				{chips.map((c) => (
					<button
						key={c ?? "all"}
						type="button"
						onClick={() => setCategory(c)}
						className={cn("border px-2 py-0.5 text-xs", category === c ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-accent")}
						data-motion-template-category={c ?? "all"}
					>
						{c ?? "All"}
					</button>
				))}
			</div>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
				{shown.map((t) => (
					<div key={t.id} className="group bg-card hover:border-primary relative border" data-motion-template={t.id}>
						<button type="button" className="block w-full text-left" onClick={() => void use(t)} title="Use this template">
							<TemplatePreview template={t} />
							<div className="p-2">
								<div className="truncate text-sm">{t.name}</div>
								<div className="text-muted-foreground text-xs">{t.category}</div>
							</div>
						</button>
						{t.category === "My templates" && (
							<button
								type="button"
								aria-label={`Delete template ${t.name}`}
								className="bg-background/80 absolute top-1 right-1 p-1 opacity-0 group-hover:opacity-100"
								onClick={async () => {
									if (!window.confirm(`Delete the template “${t.name}”?`)) return;
									await deleteMotionTemplate(t.id);
									setSaved((list) => list.filter((s) => s.id !== t.id));
								}}
							>
								<Trash2 className="size-3.5" />
							</button>
						)}
					</div>
				))}
				{!shown.length && <p className="text-muted-foreground col-span-full text-sm">No templates match.</p>}
			</div>
		</section>
	);
}
