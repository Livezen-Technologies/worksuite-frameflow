"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cloud, Download, HardDrive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWorksuiteAccount } from "@/account/use-worksuite-account";
import { useEditor } from "@/editor/use-editor";
import { useCloudSync } from "../store";
import { downloadCloudProject } from "../sync";

/** Local / Both badge on a project card (CL-03); hidden when signed out. */
export function ProjectCloudBadge({ projectId }: { projectId: string }) {
	const { state } = useWorksuiteAccount();
	const linked = useCloudSync((s) => !!s.links[projectId]);
	if (state?.status !== "signed-in") return null;
	return (
		<span
			data-cloud-badge={linked ? "both" : "local"}
			className="inline-flex items-center gap-1 rounded-sm bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white"
		>
			{linked ? (
				<Cloud className="size-3 text-sky-300" />
			) : (
				<HardDrive className="size-3" />
			)}
			{linked ? "Local + Cloud" : "Local"}
		</span>
	);
}

/** Cloud projects not on this device yet, with a download to open them. */
export function CloudOnlyProjects() {
	const router = useRouter();
	const editor = useEditor();
	const { state } = useWorksuiteAccount();
	const links = useCloudSync((s) => s.links);
	const cloudProjects = useCloudSync((s) => s.cloudProjects);
	const [busy, setBusy] = useState<{ id: string; progress: number } | null>(
		null,
	);

	if (state?.status !== "signed-in") return null;
	const linkedIds = new Set(Object.values(links).map((link) => link.cloudId));
	const cloudOnly = cloudProjects.filter((p) => !linkedIds.has(p.id));
	if (cloudOnly.length === 0) return null;

	const open = async (cloudId: string) => {
		setBusy({ id: cloudId, progress: 0 });
		try {
			const localId = await downloadCloudProject({
				cloudId,
				onProgress: (progress) => setBusy({ id: cloudId, progress }),
			});
			await editor.project.loadAllProjects();
			router.push(`/editor/${localId}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Download failed");
		} finally {
			setBusy(null);
		}
	};

	return (
		<section className="flex flex-col gap-2 px-4" data-cloud-only>
			<h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
				<Cloud className="size-3.5" /> In Worksuite Cloud
			</h2>
			<div className="flex flex-col divide-y rounded-md border">
				{cloudOnly.map((project) => (
					<div key={project.id} className="flex items-center gap-3 px-3 py-2">
						<span className="inline-flex items-center gap-1 rounded-sm bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
							<Cloud className="size-3" /> Cloud
						</span>
						<span className="min-w-0 flex-1 truncate text-sm">
							{project.name}
						</span>
						{project.updatedAt && (
							<span className="text-muted-foreground hidden text-xs sm:block">
								Updated {new Date(project.updatedAt).toLocaleDateString()}
							</span>
						)}
						<Button
							size="sm"
							variant="outline"
							disabled={!!busy}
							onClick={() => void open(project.id)}
						>
							{busy?.id === project.id ? (
								<>
									<Loader2 className="animate-spin" />
									{Math.round(busy.progress * 100)}%
								</>
							) : (
								<>
									<Download />
									Download and open
								</>
							)}
						</Button>
					</div>
				))}
			</div>
		</section>
	);
}
