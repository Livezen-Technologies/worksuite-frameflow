"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { isTypableDOMElement } from "@/utils/browser";
import { cn } from "@/utils/ui";
import { readCurrentLayout } from "../current";
import { allWorkspaces, useWorkspaceStore } from "../store";
import { useT } from "@/i18n";

type NameDialog = { mode: "save" } | { mode: "rename"; id: string } | null;

/**
 * Workspace tabs in the editor header (SRS WS-01–WS-04): switch with a click
 * or Alt+1…Alt+9, save the current layout, rename, reset and delete.
 */
export function WorkspaceBar() {
	const t = useT();
	const activeId = useWorkspaceStore((s) => s.activeId);
	const custom = useWorkspaceStore((s) => s.custom);
	const switchTo = useWorkspaceStore((s) => s.switchTo);
	const saveAs = useWorkspaceStore((s) => s.saveAs);
	const rename = useWorkspaceStore((s) => s.rename);
	const remove = useWorkspaceStore((s) => s.remove);
	const reset = useWorkspaceStore((s) => s.reset);
	const [dialog, setDialog] = useState<NameDialog>(null);
	const [name, setName] = useState("");

	const workspaces = allWorkspaces(custom);
	const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
				return;
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				isTypableDOMElement({ element: target })
			)
				return;
			// event.code works with layouts where Alt changes the typed character (macOS).
			const digit = /^Digit([1-9])$/.exec(event.code)?.[1];
			if (!digit) return;
			const workspace = allWorkspaces(useWorkspaceStore.getState().custom)[
				Number(digit) - 1
			];
			if (!workspace) return;
			event.preventDefault();
			useWorkspaceStore
				.getState()
				.switchTo({ id: workspace.id, current: readCurrentLayout() });
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const openNameDialog = (next: NameDialog) => {
		setName(next?.mode === "rename" ? active.name : "");
		setDialog(next);
	};

	const submitName = () => {
		if (!dialog) return;
		if (dialog.mode === "save") {
			const workspace = saveAs({ name, current: readCurrentLayout() });
			toast.success(`Saved workspace "${workspace.name}"`);
		} else {
			rename({ id: dialog.id, name });
		}
		setDialog(null);
	};

	return (
		<>
			<div
				role="toolbar"
				aria-label="Workspaces"
				className="bg-popover flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[10px] p-[3px]"
			>
				{workspaces.map((workspace, index) => {
					const isActive = workspace.id === active.id;
					return (
						<button
							key={workspace.id}
							type="button"
							aria-pressed={isActive}
							title={`${workspace.description}${index < 9 ? ` (Alt+${index + 1})` : ""}`}
							onClick={() =>
								switchTo({ id: workspace.id, current: readCurrentLayout() })
							}
							className={cn(
								"h-[30px] shrink-0 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors",
								isActive
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:text-foreground hover:bg-accent",
							)}
						>
							{t(workspace.name)}
						</button>
					);
				})}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label="Workspace options"
							className="text-muted-foreground hover:bg-accent hover:text-foreground h-[30px] w-[30px] shrink-0 rounded-lg text-base font-semibold"
						>
							+
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-72">
						<DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
							{t("Workspace: {name}", { name: t(active.name) })}
						</DropdownMenuLabel>
						<DropdownMenuItem onClick={() => openNameDialog({ mode: "save" })}>
							Save current layout as new workspace…
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => {
								reset({ id: active.id });
								toast.success(`Reset "${active.name}" to its default layout`);
							}}
						>
							Reset “{active.name}” to default layout
						</DropdownMenuItem>
						{!active.builtIn && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() =>
										openNameDialog({ mode: "rename", id: active.id })
									}
								>
									Rename workspace…
								</DropdownMenuItem>
								<DropdownMenuItem
									variant="destructive"
									onClick={() => {
										remove({ id: active.id });
										toast.success(`Deleted workspace "${active.name}"`);
									}}
								>
									Delete workspace
								</DropdownMenuItem>
							</>
						)}
						<DropdownMenuSeparator />
						<DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
							Switch with Alt+1 to Alt+{Math.min(workspaces.length, 9)}
						</DropdownMenuLabel>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<Dialog
				open={dialog !== null}
				onOpenChange={(open) => !open && setDialog(null)}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>
							{dialog?.mode === "rename"
								? "Rename workspace"
								: "Save layout as workspace"}
						</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<form
							id="workspace-name-form"
							onSubmit={(event) => {
								event.preventDefault();
								submitName();
							}}
							className="flex flex-col gap-2"
						>
							<label
								htmlFor="workspace-name"
								className="text-muted-foreground text-sm"
							>
								Name
							</label>
							<Input
								id="workspace-name"
								value={name}
								maxLength={40}
								placeholder="e.g. Interview edit"
								onChange={(event) => setName(event.target.value)}
							/>
						</form>
					</DialogBody>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDialog(null)}>
							Cancel
						</Button>
						<Button
							type="submit"
							form="workspace-name-form"
							disabled={!name.trim()}
						>
							{dialog?.mode === "rename" ? "Rename" : "Save"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
