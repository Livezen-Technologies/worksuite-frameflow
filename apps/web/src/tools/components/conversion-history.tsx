"use client";

import { FolderOpen, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { formatBytes } from "@/library/components/page-shell";
import { useConversionHistory } from "../history";
import { openSavedInEditor } from "../open-in-editor";
import { cleanError } from "./video-converter";

/** Screen 25: everything converted, searchable (CV-08). */
export function ConversionHistory() {
	const editor = useEditor();
	const router = useRouter();
	const records = useConversionHistory((s) => s.records);
	const clear = useConversionHistory((s) => s.clear);
	const [query, setQuery] = useState("");
	const q = query.trim().toLowerCase();
	const shown = q ? records.filter((r) => `${r.name} ${r.to} ${r.output}`.toLowerCase().includes(q)) : records;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3" data-conversion-history>
			<div className="flex gap-2">
				<input
					className="flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"
					placeholder="Search conversions"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				<Button variant="outline" disabled={!records.length} onClick={clear}>Clear history</Button>
			</div>
			{shown.length === 0 ? (
				<p className="text-muted-foreground py-16 text-center text-sm">
					{records.length ? "No conversions match." : "Finished conversions show up here."}
				</p>
			) : (
				<ul className="flex flex-col divide-y overflow-auto rounded-lg border">
					{shown.map((r) => (
						<li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm" data-history-row>
							<div className="min-w-0 flex-1">
								<div className="truncate font-medium">{r.name}</div>
								<div className="text-muted-foreground truncate text-xs">
									{r.to} · {formatBytes(r.sourceBytes)} → {formatBytes(r.bytes)} · {new Date(r.at).toLocaleString()}
								</div>
							</div>
							<Button size="sm" variant="ghost" onClick={() => void window.worksuite?.files?.show(r.output)}>
								<FolderOpen />
							</Button>
							<Button size="sm" variant="ghost" onClick={() =>
								void openSavedInEditor({ editor, filePath: r.output, push: router.push }).catch((e) => toast.error(cleanError(e)))
							}>
								<Pencil />
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
