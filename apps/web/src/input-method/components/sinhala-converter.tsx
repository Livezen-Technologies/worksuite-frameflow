"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadFullFont } from "@/fonts/google-fonts";
import { installedLegacyFonts, SINHALA_UNICODE_FONTS } from "@/fonts/sinhala-fonts";
import { isLegacyFont, legacyToUnicode, looksLikeLegacy, unicodeToLegacy } from "../legacy";
import { convertSinglishText } from "../sinhala";

/**
 * Unicode ⇄ legacy (FM/DL) converter with a live preview in any Sinhala
 * font. Either box can be edited; the other follows. Applying keeps the text
 * as Unicode and sets the font, so nothing is lost when switching later.
 */
export function SinhalaConverter({
	open,
	onOpenChange,
	initialText,
	initialFont,
	initialSize,
	onApply,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialText: string;
	initialFont: string;
	initialSize: number;
	onApply: (result: { content: string; fontFamily: string; fontSize: number }) => void;
}) {
	const [unicode, setUnicode] = useState(initialText);
	const [legacy, setLegacy] = useState(() => unicodeToLegacy({ text: initialText }));
	const [font, setFont] = useState(initialFont || "Noto Sans Sinhala");
	// Same units as the text clip's font size.
	const [size, setSize] = useState(Math.max(4, Math.min(80, initialSize || 15)));
	const [installed, setInstalled] = useState<string[]>([]);

	useEffect(() => {
		let cancelled = false;
		void installedLegacyFonts().then((list) => {
			if (!cancelled) setInstalled(list);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const fonts = [...SINHALA_UNICODE_FONTS.map((f) => f.family), ...installed];
	if (!fonts.includes(font)) fonts.unshift(font);
	const legacyFont = isLegacyFont({ fontFamily: font });

	const fromUnicode = (text: string) => {
		setUnicode(text);
		setLegacy(unicodeToLegacy({ text }));
	};
	const fromLegacy = (text: string) => {
		setLegacy(text);
		setUnicode(legacyToUnicode({ text }));
	};
	const copy = ({ text, what }: { text: string; what: string }) =>
		void navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${what}`));

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl" data-sinhala-converter>
				<DialogHeader>
					<DialogTitle>Sinhala converter</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3 px-6 pb-6 text-sm">
					<div className="grid gap-3 md:grid-cols-2">
						<label className="flex flex-col gap-1">
							<span className="text-muted-foreground text-xs">Unicode (type Singlish here too)</span>
							<textarea
								value={unicode}
								onChange={(e) => fromUnicode(e.target.value)}
								rows={4}
								className="bg-muted/40 border p-2"
								style={{ fontFamily: "'Noto Sans Sinhala', sans-serif" }}
								data-converter-unicode
							/>
						</label>
						<label className="flex flex-col gap-1">
							<span className="text-muted-foreground text-xs">Legacy FM / DL encoding (paste legacy text here)</span>
							<textarea
								value={legacy}
								onChange={(e) => fromLegacy(e.target.value)}
								rows={4}
								className="bg-muted/40 border p-2 font-mono text-xs"
								data-converter-legacy
							/>
						</label>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{/[A-Za-z]/.test(unicode) && (
							<Button variant="outline" size="sm" onClick={() => fromUnicode(convertSinglishText({ text: unicode }))} data-converter-singlish>
								Singlish → සිංහල
							</Button>
						)}
						{looksLikeLegacy({ text: unicode }) && (
							<Button variant="outline" size="sm" onClick={() => fromLegacy(unicode)}>
								This looks like legacy text: convert it
							</Button>
						)}
						<label className="flex items-center gap-2 text-xs">
							Font
							<select
								value={font}
								onChange={(e) => {
									const next = e.target.value;
									setFont(next);
									if (!isLegacyFont({ fontFamily: next }) && next !== "Noto Sans Sinhala") void loadFullFont({ family: next }).catch(() => {});
								}}
								className="bg-muted/50 h-8 border px-2"
								data-converter-font
							>
								{fonts.map((f) => (
									<option key={f} value={f}>
										{f}
										{isLegacyFont({ fontFamily: f }) ? " (legacy)" : ""}
									</option>
								))}
							</select>
						</label>
						<label className="flex items-center gap-2 text-xs">
							Size
							<input type="range" min={4} max={80} value={size} onChange={(e) => setSize(Number(e.target.value))} data-converter-size />
							<span className="w-8 tabular-nums">{size}</span>
						</label>
					</div>
					<div
						className="bg-muted/30 flex min-h-28 items-center justify-center overflow-auto border p-4 text-center whitespace-pre-wrap"
						style={{ fontFamily: `"${font}", 'Noto Sans Sinhala', sans-serif`, fontSize: size * 2.5 }}
						data-converter-preview
					>
						{legacyFont ? legacy : unicode}
					</div>
					<div className="flex flex-wrap justify-end gap-2">
						<Button variant="outline" size="sm" onClick={() => copy({ text: unicode, what: "Unicode text" })}>
							Copy Unicode
						</Button>
						<Button variant="outline" size="sm" onClick={() => copy({ text: legacy, what: "legacy text" })}>
							Copy legacy
						</Button>
						<Button
							size="sm"
							data-converter-apply
							onClick={() => {
								onApply({ content: unicode, fontFamily: font, fontSize: size });
								onOpenChange(false);
							}}
						>
							Use in text
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
