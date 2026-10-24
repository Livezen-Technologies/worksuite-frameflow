"use client";

import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createMotionProject, type MotionProject } from "../model";
import { deleteMotionProject, listMotionProjects, saveMotionProject } from "../storage";
import { StageThumbnail } from "./stage";

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
					<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
					</div>
				</section>
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
