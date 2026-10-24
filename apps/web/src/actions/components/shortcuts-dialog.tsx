"use client";

import { Plus, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ACTIONS, getDefaultShortcuts, type TActionWithOptionalArgs } from "@/actions";
import type { ShortcutKey } from "@/actions/keybinding";
import { KEYBINDING_PRESETS, presetKeybindings } from "@/actions/keybinding-presets";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils/ui";
import { getPlatformAlternateKey, getPlatformSpecialKey } from "@/utils/platform";

const CATEGORY_LABELS: Record<string, string> = {
	playback: "Playback",
	navigation: "Navigation",
	editing: "Editing",
	selection: "Selection",
	history: "History",
	timeline: "Timeline",
	controls: "Controls",
	assets: "Assets",
};

const KEY_LABELS: Record<string, string> = {
	left: "←",
	right: "→",
	up: "↑",
	down: "↓",
	space: "Space",
	enter: "Enter",
	escape: "Esc",
	esc: "Esc",
	backspace: "Backspace",
	delete: "Delete",
	home: "Home",
	end: "End",
	tab: "Tab",
};

/** "ctrl+shift+z" → ["⌘"/"Ctrl", "Shift", "Z"]. */
export function keyParts(key: string): string[] {
	const parts = key.split("+");
	// A literal "+" can't occur (it's typed as shift+=), so splitting is safe; "-" stays a key.
	return parts.map((p) =>
		p === "ctrl" ? getPlatformSpecialKey() : p === "alt" ? getPlatformAlternateKey() : p === "shift" ? "Shift" : (KEY_LABELS[p] ?? p.toUpperCase()),
	);
}

/** Actions a person can bind (ones that need arguments are run by the app itself). */
const isBindable = (a: string): a is TActionWithOptionalArgs => a in ACTIONS && !("args" in (ACTIONS as Record<string, object>)[a]);
const BINDABLE: TActionWithOptionalArgs[] = Object.keys(ACTIONS).filter(isBindable);
type TAction = TActionWithOptionalArgs;

type Recording = { action: TAction; replace?: ShortcutKey } | null;

/** The shortcut manager: search, rebind, add or remove keys, presets, import/export. */
export function ShortcutsDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
	const keybindings = useKeybindingsStore((s) => s.keybindings);
	const { updateKeybinding, removeKeybinding, getKeybindingString, setIsRecording, resetToDefaults, setAllKeybindings, importKeybindings, exportKeybindings } =
		useKeybindingsStore.getState();
	const [query, setQuery] = useState("");
	const [recording, setRecording] = useState<Recording>(null);
	const [conflict, setConflict] = useState<{ action: TAction; key: ShortcutKey; replace?: ShortcutKey; ownerName: string } | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const defaults = useMemo(() => getDefaultShortcuts(), []);

	const keysFor = (action: TAction) => [...keybindings].filter(([, a]) => a === action).map(([k]) => k);
	const defaultKeysFor = (action: TAction) => [...defaults].filter(([, a]) => a === action).map(([k]) => k);
	const isModified = (action: TAction) => keysFor(action).sort().join() !== defaultKeysFor(action).sort().join();

	const assign = ({ action, key, replace }: { action: TAction; key: ShortcutKey; replace?: ShortcutKey }) => {
		if (replace && replace !== key) removeKeybinding(replace);
		updateKeybinding({ key, action });
	};

	useEffect(() => {
		if (!recording) return;
		setIsRecording(true);
		const onKey = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
				setRecording(null);
				return;
			}
			const key = getKeybindingString(e);
			if (!key) return;
			const current = recording;
			setRecording(null);
			const owner = useKeybindingsStore.getState().keybindings.get(key);
			if (owner && owner !== current.action) {
				const ownerName = (ACTIONS as Record<string, { description: string }>)[owner]?.description ?? owner;
				setConflict({ action: current.action, key, replace: current.replace, ownerName });
				return;
			}
			assign({ action: current.action, key, replace: current.replace });
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => {
			window.removeEventListener("keydown", onKey, { capture: true });
			setIsRecording(false);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm only when what's being recorded changes
	}, [recording]);

	const q = query.trim().toLowerCase();
	const visible = BINDABLE.filter((action) => {
		if (!q) return true;
		const def = ACTIONS[action];
		return (
			def.description.toLowerCase().includes(q) ||
			def.category.includes(q) ||
			keysFor(action).some((k) => k.includes(q) || keyParts(k).join(" ").toLowerCase().includes(q))
		);
	});
	const categories = [...new Set(visible.map((a) => ACTIONS[a].category))];
	const modifiedCount = BINDABLE.filter(isModified).length;

	const exportFile = () => {
		const blob = new Blob([JSON.stringify({ app: "FrameFlow", version: 1, keybindings: exportKeybindings() }, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "frameflow-shortcuts.json";
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 5000);
	};
	const importFile = async (file: File) => {
		try {
			const parsed: unknown = JSON.parse(await file.text());
			const map = parsed && typeof parsed === "object" && "keybindings" in parsed ? parsed.keybindings : parsed;
			if (!map || typeof map !== "object") throw new Error("Not a shortcuts file");
			const config: Record<string, TAction> = {};
			for (const [key, action] of Object.entries(map)) if (typeof action === "string" && isBindable(action)) config[key] = action;
			if (!Object.keys(config).length) throw new Error("No shortcuts in this file");
			importKeybindings(config);
			toast.success(`Imported ${Object.keys(config).length} shortcuts`);
		} catch (error) {
			toast.error("Couldn't import shortcuts", { description: error instanceof Error ? error.message : String(error) });
		}
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) setRecording(null);
				onOpenChange(open);
			}}
		>
			<DialogContent className="flex max-h-[85vh] max-w-2xl flex-col p-0" data-shortcuts-dialog>
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
				</DialogHeader>
				<div className="flex flex-wrap items-center gap-2 px-6 pb-2">
					<label className="bg-muted/50 flex h-8 min-w-0 flex-1 items-center gap-2 border px-2">
						<Search className="text-muted-foreground size-3.5" />
						<input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search actions or keys"
							className="min-w-0 flex-1 bg-transparent text-sm outline-none"
							data-shortcuts-search
						/>
					</label>
					<select
						aria-label="Shortcut preset"
						className="bg-muted/50 h-8 border px-2 text-sm"
						value=""
						onChange={(e) => {
							const preset = KEYBINDING_PRESETS.find((p) => p.id === e.target.value);
							if (!preset) return;
							if (preset.id === "frameflow") resetToDefaults();
							else setAllKeybindings(presetKeybindings({ id: preset.id }));
							toast.success(`Using ${preset.name} shortcuts`);
						}}
						data-shortcuts-preset
					>
						<option value="" disabled>
							Presets…
						</option>
						{KEYBINDING_PRESETS.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
				</div>
				{conflict && (
					<div className="bg-caution/15 mx-6 mb-2 flex flex-wrap items-center gap-2 border px-3 py-2 text-sm" role="alert" data-shortcut-conflict>
						<span className="flex-1">
							<b>{keyParts(conflict.key).join(" + ")}</b> is used by “{conflict.ownerName}”. Use it for “{ACTIONS[conflict.action].description}” instead?
						</span>
						<Button
							size="sm"
							onClick={() => {
								assign(conflict);
								setConflict(null);
							}}
							data-shortcut-reassign
						>
							Reassign
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setConflict(null)}>
							Cancel
						</Button>
					</div>
				)}
				<DialogBody className="scrollbar-thin grow overflow-y-auto">
					<div className="flex flex-col gap-5">
						{categories.map((category) => (
							<section key={category} className="flex flex-col gap-1">
								<h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{CATEGORY_LABELS[category] ?? category}</h3>
								{visible
									.filter((a) => ACTIONS[a].category === category)
									.map((action) => {
										const keys = keysFor(action);
										const modified = isModified(action);
										const recordingHere = recording?.action === action;
										return (
											<div key={action} className="hover:bg-accent/40 flex min-h-9 items-center gap-2 px-1" data-shortcut-row={action}>
												<span className="flex-1 text-sm">
													{ACTIONS[action].description}
													{modified && <span className="text-primary ml-1.5 text-[10px]" title="Changed from the default">● changed</span>}
												</span>
												<div className="flex flex-wrap items-center justify-end gap-1">
													{keys.map((key) => (
														<span key={key} className="group/key flex items-center">
															<button
																type="button"
																title="Click, then press the new keys"
																onClick={() => setRecording({ action, replace: key })}
																className={cn(
																	"bg-muted flex h-7 items-center gap-0.5 border px-1.5 font-mono text-xs",
																	recordingHere && recording?.replace === key && "border-primary text-primary animate-pulse",
																)}
																data-shortcut-key={key}
															>
																{recordingHere && recording?.replace === key ? "Press keys…" : keyParts(key).map((p, i) => (
																	// biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
																	<kbd key={i} className="px-0.5">{p}</kbd>
																))}
															</button>
															<button
																type="button"
																aria-label={`Remove ${key}`}
																className="text-muted-foreground hover:text-foreground hidden h-7 px-0.5 group-hover/key:block"
																onClick={() => removeKeybinding(key)}
															>
																<X className="size-3" />
															</button>
														</span>
													))}
													{recordingHere && !recording?.replace && (
														<span className="border-primary text-primary flex h-7 animate-pulse items-center border px-2 font-mono text-xs">Press keys…</span>
													)}
													<button
														type="button"
														aria-label={`Add a shortcut for ${ACTIONS[action].description}`}
														title={keys.length ? "Add another shortcut" : "Add a shortcut"}
														onClick={() => setRecording({ action })}
														className="text-muted-foreground hover:text-foreground flex h-7 items-center border border-dashed px-1.5"
														data-shortcut-add={action}
													>
														<Plus className="size-3" />
													</button>
													<button
														type="button"
														aria-label="Reset to default"
														title="Reset to default"
														disabled={!modified}
														className="text-muted-foreground hover:text-foreground h-7 px-1 disabled:invisible"
														onClick={() => {
															for (const k of keys) removeKeybinding(k);
															for (const k of defaultKeysFor(action)) {
																const owner = useKeybindingsStore.getState().keybindings.get(k);
																if (!owner || owner === action) updateKeybinding({ key: k, action });
															}
														}}
														data-shortcut-reset={action}
													>
														<RotateCcw className="size-3.5" />
													</button>
												</div>
											</div>
										);
									})}
							</section>
						))}
						{!visible.length && <p className="text-muted-foreground py-6 text-center text-sm">No shortcuts match “{query}”.</p>}
					</div>
				</DialogBody>
				<DialogFooter className="flex flex-wrap items-center gap-2">
					<span className="text-muted-foreground mr-auto text-xs">
						{recording ? "Press the new keys, or Esc to cancel." : modifiedCount ? `${modifiedCount} changed from the defaults` : "Click a key to change it, + to add one."}
					</span>
					<input
						ref={fileRef}
						type="file"
						accept=".json,application/json"
						className="hidden"
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (file) void importFile(file);
						}}
						data-shortcuts-import-input
					/>
					<Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
						Import
					</Button>
					<Button variant="outline" size="sm" onClick={exportFile} data-shortcuts-export>
						Export
					</Button>
					<Button variant="destructive" size="sm" onClick={resetToDefaults} data-shortcuts-reset-all>
						Reset all
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
