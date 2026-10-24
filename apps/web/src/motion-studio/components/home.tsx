"use client";

import { ArrowLeft, FileUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { dotLottieText } from "@/lottie/user-library";
import { parseLottie } from "@/lottie/colors";
import { lottieToMotion } from "../lottie-convert";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createMotionProject, type MotionProject } from "../model";
import { deleteMotionProject, listMotionProjects, saveMotionProject } from "../storage";
import { StageThumbnail } from "./stage";
import { TemplateLibrary } from "./template-library";

const SIZES = [
	{ label: "Landscape 16:9", width: 1920, height: 1080 },
	{ label: "Vertical 9:16", width: 1080, height: 1920 },
	{ label: "Square 1:1", width: 1080, height: 1080 },
	{ label: "Portrait 4:5", width: 1080, height: 1350 },
];

/** Motion Studio home: new project sizes and recent motion projects. */
export function MotionHome() {
	const router = useRouter();
	const [projects, setProjects] = useState<MotionProject[] | null>(null);

	useEffect(() => {
		listMotionProjects()
			.then(setProjects)
			.catch(() => setProjects([]));
	}, []);

	const create = async (size: { width: number; height: number }) => {
		const project = createMotionProject({ ...size });
		await saveMotionProject(project);
		router.push(`/motion/${project.id}`);
	};

	const importLottie = async (file: File) => {
		try {
			const text = file.name.toLowerCase().endsWith(".lottie") ? dotLottieText(new Uint8Array(await file.arrayBuffer())) : await file.text();
			const { project, warnings, animated } = lottieToMotion({ json: parseLottie(text), name: file.name.replace(/\.(json|lottie)$/i, "") });
			// Animated pictures (GIFs FrameFlow exported) become GIFs again.
			if (animated.length) {
				const { framesToGif } = await import("../export");
				for (const a of animated) {
					const gif = await framesToGif({ frames: a.frames });
					const layer = project.layers.find((l) => l.id === a.layerId);
					if (gif && layer?.kind === "image") layer.src = gif;
				}
			}
			if (!project.layers.length) throw new Error(warnings[0] ?? "Nothing in this file could be edited here.");
			await saveMotionProject(project);
			if (warnings.length)
				toast.warning(`Imported ${project.layers.length} layers, with some changes`, { description: warnings.join(" "), duration: 12_000 });
			else toast.success(`Imported ${project.layers.length} layers`);
			router.push(`/motion/${project.id}`);
		} catch (error) {
			toast.error(`Couldn't import ${file.name}`, { description: error instanceof Error ? error.message : String(error) });
		}
	};

	return (
		<div className="bg-background text-foreground min-h-screen" data-motion-home>
			<header className="flex items-center gap-3 border-b px-4 py-3">
				<Link href="/projects" className="text-muted-foreground hover:text-foreground" aria-label="Back to projects">
					<ArrowLeft className="size-4" />
				</Link>
				<h1 className="text-lg font-semibold">Motion Studio</h1>
				<span className="text-muted-foreground text-sm">Create vector animations for your videos.</span>
			</header>
			<main className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
				<section>
					<h2 className="mb-3 text-sm font-semibold">New motion project</h2>
					<div className="grid grid-cols-2 gap-3 md:grid-cols-5">
						{SIZES.map((size) => (
							<button
								key={size.label}
								type="button"
								onClick={() => void create(size)}
								className="border-border bg-card hover:border-primary flex flex-col items-center gap-3 border p-4 text-sm"
								data-motion-new={`${size.width}x${size.height}`}
							>
								<span className="flex h-20 items-center justify-center">
									<span
										className="border-primary/70 flex items-center justify-center border-2"
										style={{ width: (size.width / Math.max(size.width, size.height)) * 72, height: (size.height / Math.max(size.width, size.height)) * 72 }}
									>
										<Plus className="text-primary size-5" />
									</span>
								</span>
								<span>{size.label}</span>
								<span className="text-muted-foreground text-xs">
									{size.width} × {size.height}
								</span>
							</button>
						))}
						<label className="border-border bg-card hover:border-primary flex cursor-pointer flex-col items-center gap-3 border border-dashed p-4 text-sm" data-motion-import>
							<span className="flex h-20 items-center justify-center">
								<FileUp className="text-primary size-8" />
							</span>
							<span>Import Lottie</span>
							<span className="text-muted-foreground text-xs">.json or .lottie, editable layers</span>
							<input
								type="file"
								accept=".json,.lottie,application/json"
								className="hidden"
								onChange={(e) => {
									const file = e.target.files?.[0];
									e.target.value = "";
									if (file) void importLottie(file);
								}}
							/>
						</label>
					</div>
				</section>
				<TemplateLibrary />
				<section>
					<h2 className="mb-3 text-sm font-semibold">Recent motion projects</h2>
					{projects === null ? null : projects.length === 0 ? (
						<p className="text-muted-foreground text-sm">No motion projects yet.</p>
					) : (
						<div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-motion-recent>
							{projects.map((p) => (
								<div key={p.id} className="group bg-card hover:border-primary relative border">
									<Link href={`/motion/${p.id}`} className="block">
										<div className="flex aspect-video items-center justify-center bg-[repeating-conic-gradient(#1a1d24_0%_25%,#14171d_0%_50%)] bg-[length:16px_16px]">
											<StageThumbnail project={p} className="max-h-full max-w-full" />
										</div>
										<div className="p-2">
											<div className="truncate text-sm">{p.name}</div>
											<div className="text-muted-foreground text-xs">
												{p.width}×{p.height} · {p.duration}s · {new Date(p.updatedAt).toLocaleDateString()}
											</div>
										</div>
									</Link>
									<button
										type="button"
										aria-label={`Delete ${p.name}`}
										className="bg-background/80 absolute top-1 right-1 p-1 opacity-0 group-hover:opacity-100"
										onClick={async () => {
											if (!window.confirm(`Delete “${p.name}”?`)) return;
											await deleteMotionProject(p.id);
											setProjects((list) => list?.filter((x) => x.id !== p.id) ?? null);
										}}
									>
										<Trash2 className="size-3.5" />
									</button>
								</div>
							))}
						</div>
					)}
				</section>
			</main>
		</div>
	);
}
