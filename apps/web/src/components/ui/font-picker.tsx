"use client";

import { useState, useMemo, useRef, useEffect, useCallback, type CSSProperties } from "react";
import { List, type RowComponentProps } from "react-window";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loadFullFont } from "@/fonts/google-fonts";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";
import { installedLegacyFonts, SINHALA_SAMPLE, SINHALA_UNICODE_FONTS } from "@/fonts/sinhala-fonts";
import { pickFontFiles, useUserFonts } from "@/fonts/user-fonts";
import { reportFontImport } from "@/fonts/components/user-fonts-section";
import { isLegacyFont, LEGACY_FONT_FAMILIES, unicodeToLegacy } from "@/input-method/legacy";
import type { FontAtlas, FontAtlasEntry } from "@/fonts/types";
import { useFontAtlas } from "@/fonts/use-font-atlas";
import { cn } from "@/utils/ui";
import { ChevronDown, Search } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { TextIcon } from "@hugeicons/core-free-icons";

const FONT_TABS = [
	{ key: "all", label: "All fonts" },
	{ key: "my-fonts", label: "My fonts" },
	{ key: "favorites", label: "Favorites" },
	{ key: "sinhala", label: "සිංහල" },
] as const;

type FontTab = (typeof FONT_TABS)[number]["key"];

const ROW_HEIGHT = 40;
const PREVIEW_SCALE = 0.8;
const LIST_WIDTH = 288;
const MAX_LIST_HEIGHT = 288;
const OVERSCAN = 15;

interface FontPickerProps {
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	className?: string;
}

export function FontPicker({
	defaultValue,
	onValueChange,
	className,
}: FontPickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [activeTab, setActiveTab] = useState<FontTab>("all");
	const searchInputRef = useRef<HTMLInputElement>(null);
	const { atlas, status, fontNames, retry: handleRetry } = useFontAtlas({ open });

	const filteredFonts = useMemo(() => {
		if (!search) return fontNames;
		const query = search.toLowerCase();
		return fontNames.filter((name) => name.toLowerCase().includes(query));
	}, [fontNames, search]);

	const listHeight = Math.min(
		MAX_LIST_HEIGHT,
		filteredFonts.length * ROW_HEIGHT,
	);

	const handleSelect = useCallback(
		async ({ family }: { family: string }) => {
			const imported = useUserFonts.getState().fonts.some((f) => f.family === family);
			if (!SYSTEM_FONTS.has(family) && !isLegacyFont({ fontFamily: family }) && !imported) {
				try {
					await loadFullFont({ family });
				} catch {
					// ignore load failure, font will fall back to system default
				}
			}
			onValueChange?.(family);
			setOpen(false);
		},
		[onValueChange],
	);

	useEffect(() => {
		if (!open) {
			setSearch("");
			setActiveTab("all");
		}
	}, [open]);

	const activeTabLabel =
		FONT_TABS.find((t) => t.key === activeTab)?.label.toLowerCase() ?? "";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				className={cn(
					"border-border bg-accent flex h-7 w-full cursor-pointer items-center justify-between gap-1 rounded-md border px-2.5 text-sm whitespace-nowrap focus-visible:border-primary focus-visible:ring-0 focus:outline-hidden",
					className,
				)}
			>
				<div className="flex min-w-0 items-center gap-1.5">
					<span className="text-muted-foreground [&_svg]:size-3.5 shrink-0">
						<HugeiconsIcon icon={TextIcon} />
					</span>
					<span className="truncate" style={{ fontFamily: defaultValue }}>
						{defaultValue ?? "Select a font"}
					</span>
				</div>
				<ChevronDown className="size-3 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent
				className="w-72 p-0 overflow-hidden"
				align="start"
				side="left"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					searchInputRef.current?.focus();
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<div className="relative px-3 py-1.5">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 shrink-0 opacity-50" />
					<Input
						ref={searchInputRef}
						placeholder={`Search ${activeTabLabel}...`}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						size="xs"
						className="w-full pl-5 bg-transparent border-none! shadow-none!"
					/>
				</div>
				<div className="flex border-b px-3">
					{FONT_TABS.map((tab) => (
						<button
							key={tab.key}
							type="button"
							className={cn(
								"px-3 py-1.5 text-xs border-b-2 -mb-px",
								activeTab === tab.key
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setActiveTab(tab.key)}
						>
							{tab.label}
						</button>
					))}
				</div>
				{activeTab === "my-fonts" && <MyFontsList search={search} selectedFont={defaultValue} onFontSelect={handleSelect} />}
				{activeTab === "sinhala" && (
					<SinhalaFontList search={search} selectedFont={defaultValue} onFontSelect={handleSelect} />
				)}
				{activeTab === "all" && status === "loading" && (
					<div className="py-8 text-center text-sm text-muted-foreground">
						Loading fonts...
					</div>
				)}
				{activeTab === "all" && status === "error" && (
					<div className="flex flex-col items-center gap-3 py-8 px-4">
						<p className="text-sm text-muted-foreground text-center">
							Failed to load font previews.
						</p>
						<Button variant="outline" size="sm" onClick={handleRetry}>
							Retry
						</Button>
					</div>
				)}
				{activeTab === "all" &&
					status === "idle" &&
					fontNames.length > 0 &&
					filteredFonts.length === 0 && (
						<div className="py-6 text-center text-sm text-muted-foreground">
							No fonts found.
						</div>
					)}
				{activeTab === "all" && status === "idle" && atlas && filteredFonts.length > 0 && (
					<List
						rowCount={filteredFonts.length}
						rowHeight={ROW_HEIGHT}
						overscanCount={OVERSCAN}
						rowComponent={FontRow}
						rowProps={{
							atlas,
							filteredFonts,
							selectedFont: defaultValue,
							onFontSelect: handleSelect,
						}}
						style={{ height: listHeight, width: LIST_WIDTH }}
					/>
				)}
			</PopoverContent>
		</Popover>
	);
}

/** Fonts the user imported, with an import button. */
function MyFontsList({ search, selectedFont, onFontSelect }: { search: string; selectedFont: string | undefined; onFontSelect: (params: { family: string }) => void }) {
	const fonts = useUserFonts((s) => s.fonts);
	const q = search.toLowerCase();
	const shown = fonts.filter((f) => !q || f.family.toLowerCase().includes(q));
	return (
		<div className="max-h-80 overflow-y-auto py-1" data-my-fonts>
			{shown.map((f) => {
				const legacy = isLegacyFont({ fontFamily: f.family });
				return (
					<button
						key={f.id}
						type="button"
						onClick={() => onFontSelect({ family: f.family })}
						className={cn("hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left", f.family === selectedFont && "bg-accent")}
						data-my-font={f.family}
					>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-lg leading-tight" style={{ fontFamily: `"${f.family}"` }}>
								{legacy ? unicodeToLegacy({ text: SINHALA_SAMPLE }) : f.family}
							</span>
							<span className="text-muted-foreground block truncate text-[11px]">{f.family}</span>
						</span>
						{legacy && <span className="text-muted-foreground border px-1 text-[10px]">legacy</span>}
					</button>
				);
			})}
			{!fonts.length && <p className="text-muted-foreground px-3 py-3 text-xs">No fonts of your own yet.</p>}
			<button type="button" className="text-primary px-3 py-1.5 text-left text-xs hover:underline" onClick={() => void pickFontFiles().then(reportFontImport)}>
				+ Import font files…
			</button>
		</div>
	);
}

/** The Sinhala font pack: Unicode fonts, then legacy fonts installed on this computer. */
function SinhalaFontList({
	search,
	selectedFont,
	onFontSelect,
}: {
	search: string;
	selectedFont: string | undefined;
	onFontSelect: (params: { family: string }) => void;
}) {
	const [installed, setInstalled] = useState<string[] | null>(null);
	useEffect(() => {
		let cancelled = false;
		void installedLegacyFonts().then((list) => !cancelled && setInstalled(list));
		// Load the previews of the Unicode fonts.
		for (const f of SINHALA_UNICODE_FONTS) if (!f.bundled) void loadFullFont({ family: f.family, weights: [400] }).catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);
	const q = search.toLowerCase();
	const match = (name: string) => !q || name.toLowerCase().includes(q);
	const row = ({ family, legacy, available = true }: { family: string; legacy: boolean; available?: boolean }) => (
		<button
			key={family}
			type="button"
			disabled={!available}
			onClick={() => onFontSelect({ family })}
			data-sinhala-font={family}
			className={cn(
				"hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:cursor-default disabled:opacity-40",
				family === selectedFont && "bg-accent",
			)}
		>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-lg leading-tight" style={{ fontFamily: available ? `"${family}"` : undefined }}>
					{legacy && available ? unicodeToLegacy({ text: SINHALA_SAMPLE }) : SINHALA_SAMPLE}
				</span>
				<span className="text-muted-foreground block truncate text-[11px]">{family}</span>
			</span>
			{legacy && <span className="text-muted-foreground border px-1 text-[10px]">{available ? "legacy" : "not installed"}</span>}
		</button>
	);
	const imported = useUserFonts((st) => st.fonts).map((f) => f.family).filter((f) => isLegacyFont({ fontFamily: f }));
	const available = installed === null ? null : [...new Set([...imported, ...installed])];
	const missing = LEGACY_FONT_FAMILIES.filter((f) => !available?.some((a) => a.toLowerCase() === f.toLowerCase()));
	return (
		<div className="max-h-80 overflow-y-auto py-1" data-sinhala-fonts>
			<p className="text-muted-foreground px-3 pt-1 text-[10px] font-semibold uppercase">Unicode (recommended)</p>
			{SINHALA_UNICODE_FONTS.filter((f) => match(f.family)).map((f) => row({ family: f.family, legacy: false }))}
			<p className="text-muted-foreground px-3 pt-2 text-[10px] font-semibold uppercase">Legacy on this computer</p>
			{available === null ? (
				<p className="text-muted-foreground px-3 py-1 text-xs">Looking…</p>
			) : (
				available.filter(match).map((f) => row({ family: f, legacy: true }))
			)}
			{available?.length === 0 && <p className="text-muted-foreground px-3 py-1 text-xs">None yet. Import FM or DL font files, or install them on this computer.</p>}
			<button type="button" className="text-primary px-3 py-1.5 text-left text-xs hover:underline" onClick={() => void pickFontFiles().then(reportFontImport)} data-picker-import-fonts>
				+ Import font files…
			</button>
			{missing.filter(match).map((f) => row({ family: f, legacy: true, available: false }))}
			<p className="text-muted-foreground px-3 pt-2 pb-1 text-[10px]">
				Text stays Unicode; legacy fonts get it converted when drawn, so switching fonts never loses your words.
			</p>
		</div>
	);
}

function FontSpritePreview({ entry }: { entry: FontAtlasEntry }) {
	return (
		<div
			className="shrink-0"
			style={{
				width: entry.w,
				height: ROW_HEIGHT,
				backgroundColor: "currentColor",
				WebkitMaskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				WebkitMaskPosition: `-${entry.x}px -${entry.y}px`,
				WebkitMaskRepeat: "no-repeat",
				maskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				maskPosition: `-${entry.x}px -${entry.y}px`,
				maskRepeat: "no-repeat",
				transform: `scale(${PREVIEW_SCALE})`,
				transformOrigin: "left center",
			}}
		/>
	);
}

type FontRowProps = {
	atlas: FontAtlas;
	filteredFonts: string[];
	selectedFont: string | undefined;
	onFontSelect: (params: { family: string }) => void;
};

function FontRow({
	index,
	style,
	atlas,
	filteredFonts,
	selectedFont,
	onFontSelect,
}: RowComponentProps<FontRowProps>) {
	const fontName = filteredFonts[index];
	const entry = atlas.fonts[fontName];
	const isSelected = fontName === selectedFont;
	const isSystemFont = SYSTEM_FONTS.has(fontName);

	return (
		<button
			type="button"
			style={style as CSSProperties}
			className={cn(
				"flex w-full cursor-pointer items-center gap-2 px-3 outline-hidden hover:bg-popover-hover",
				isSelected && "bg-popover-hover",
			)}
			onClick={() => onFontSelect({ family: fontName })}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onFontSelect({ family: fontName });
				}
			}}
			aria-label={fontName}
		>
			<div className="min-w-0 overflow-hidden">
				{isSystemFont ? (
					<span className="text-xl text-foreground/85" style={{ fontFamily: fontName }}>
						{fontName}
					</span>
				) : (
					<FontSpritePreview entry={entry} />
				)}
			</div>
		</button>
	);
}
