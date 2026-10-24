"use client";

import { Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isLegacyFont, unicodeToLegacy } from "@/input-method/legacy";
import { importFontFiles, pickFontFiles, removeUserFont, useUserFonts } from "../user-fonts";

const SAMPLE = "ශ්‍රී ලංකා සිංහල අකුරු";

export function reportFontImport(result: { added: string[]; failed: string[] } | null) {
	if (!result) return;
	if (result.added.length)
		toast.success(`Added ${result.added.length} font${result.added.length === 1 ? "" : "s"}`, {
			description: result.added.slice(0, 6).join(", ") + (result.added.length > 6 ? "…" : ""),
		});
	else if (!result.failed.length) toast.info("Those fonts were already added.");
	if (result.failed.length) toast.error(`Couldn't read ${result.failed.length} file${result.failed.length === 1 ? "" : "s"}`, { description: result.failed.slice(0, 4).join(", ") });
}

/** Settings → Fonts: import, preview and remove your own fonts. */
export function UserFontsSection() {
	const fonts = useUserFonts((s) => s.fonts);
	const [dragging, setDragging] = useState(false);
	return (
		<div
			className="flex flex-col gap-3"
			onDragOver={(e) => {
				e.preventDefault();
				setDragging(true);
			}}
			onDragLeave={() => setDragging(false)}
			onDrop={(e) => {
				e.preventDefault();
				setDragging(false);
				void importFontFiles([...e.dataTransfer.files]).then(reportFontImport);
			}}
			data-user-fonts
		>
			<p className="text-muted-foreground text-sm">
				Add fonts you own (TTF, OTF, WOFF), such as FM or DL Sinhala fonts. They stay on this computer and show up in the font list under My fonts and සිංහල. Type in Singlish or Unicode as usual: legacy Sinhala fonts get the text converted to
				their encoding automatically.
			</p>
			<div className={`flex items-center gap-3 border border-dashed p-4 ${dragging ? "border-primary bg-primary/5" : ""}`}>
				<Button onClick={() => void pickFontFiles().then(reportFontImport)} data-import-fonts>
					<Upload className="size-4" /> Import fonts
				</Button>
				<span className="text-muted-foreground text-sm">or drop font files here</span>
			</div>
			{fonts.length > 0 && (
				<div className="divide-y border">
					{fonts.map((f) => {
						const legacy = isLegacyFont({ fontFamily: f.family });
						return (
							<div key={f.id} className="flex items-center gap-3 px-3 py-2" data-user-font={f.family}>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-xl" style={{ fontFamily: `"${f.family}"` }}>
										{legacy ? unicodeToLegacy({ text: SAMPLE }) : SAMPLE}
									</span>
									<span className="text-muted-foreground block truncate text-xs">
										{f.family} · {f.fileName}
										{legacy ? " · legacy Sinhala (auto-converted)" : ""}
									</span>
								</span>
								<button type="button" aria-label={`Remove ${f.family}`} className="text-muted-foreground hover:text-foreground p-1" onClick={() => void removeUserFont(f.id)}>
									<Trash2 className="size-4" />
								</button>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
