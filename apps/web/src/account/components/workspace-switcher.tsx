"use client";

import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/ui";
import { useWorksuiteAccount } from "../use-worksuite-account";
import type { WorksuiteWorkspace } from "../types";

function workspaceInitial(workspace: WorksuiteWorkspace) {
	return workspace.name.trim().charAt(0).toUpperCase() || "W";
}

function describe(workspace: WorksuiteWorkspace) {
	return [
		workspace.type === "personal" ? "Personal" : "Team",
		workspace.role,
		workspace.plan,
	]
		.filter(Boolean)
		.join(" · ");
}

export function useWorkspaces() {
	const { bridge, state } = useWorksuiteAccount();
	const profile = state?.status === "signed-in" ? state.profile : null;
	const workspaces = profile?.workspaces ?? [];
	const active = workspaces.find((w) => w.id === profile?.workspaceId) ?? null;

	const switchTo = async (id: string) => {
		if (!bridge || id === active?.id) return;
		try {
			await bridge.switchWorkspace(id);
			const name = workspaces.find((w) => w.id === id)?.name;
			toast.success(`Switched to ${name ?? "team"}`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn't switch team",
			);
		}
	};

	return { workspaces, active, switchTo };
}

function WorkspaceTile({
	workspace,
	className,
}: {
	workspace: WorksuiteWorkspace;
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"bg-secondary text-secondary-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
				className,
			)}
		>
			{workspaceInitial(workspace)}
		</span>
	);
}

/**
 * Worksuite Cloud workspace picker for the projects sidebar. Shows only when
 * the account belongs to more than one workspace.
 */
export function WorkspaceSwitcher() {
	const { workspaces, active } = useWorkspaces();
	if (workspaces.length < 2 || !active) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={`Team: ${active.name}. Change team`}
					className="hover:bg-accent mb-3 flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left"
				>
					<WorkspaceTile workspace={active} />
					<span className="min-w-0 flex-1">
						<span className="block truncate text-sm font-medium">
							{active.name}
						</span>
						<span className="text-muted-foreground block truncate text-xs">
							{describe(active)}
						</span>
					</span>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true"
						className="text-muted-foreground"
					>
						<path d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
					</svg>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
					Change team
				</DropdownMenuLabel>
				<WorkspaceRadioItems />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** Radio list of workspaces, for use inside any DropdownMenuContent. */
export function WorkspaceRadioItems({
	withSeparator = false,
}: {
	withSeparator?: boolean;
}) {
	const { workspaces, active, switchTo } = useWorkspaces();
	if (workspaces.length < 2 || !active) return null;

	return (
		<>
			{withSeparator && <DropdownMenuSeparator />}
			<DropdownMenuRadioGroup
				value={active.id}
				onValueChange={(id) => void switchTo(id)}
			>
				{workspaces.map((workspace) => (
					<DropdownMenuRadioItem
						key={workspace.id}
						value={workspace.id}
						className="gap-2.5"
					>
						<WorkspaceTile workspace={workspace} className="size-6" />
						<span className="min-w-0 flex-1">
							<span className="block truncate">{workspace.name}</span>
							<span className="text-muted-foreground block truncate text-xs">
								{describe(workspace)}
							</span>
						</span>
					</DropdownMenuRadioItem>
				))}
			</DropdownMenuRadioGroup>
		</>
	);
}

/** Settings list with a Switch button per workspace. */
export function WorkspaceList() {
	const { workspaces, active, switchTo } = useWorkspaces();
	if (workspaces.length === 0) return null;

	return (
		<ul className="m-0 flex list-none flex-col gap-2 p-0">
			{workspaces.map((workspace) => {
				const isActive = workspace.id === active?.id;
				return (
					<li
						key={workspace.id}
						className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
					>
						<WorkspaceTile workspace={workspace} />
						<div className="min-w-0 flex-1">
							<div className="truncate font-medium">{workspace.name}</div>
							<div className="text-muted-foreground truncate text-xs">
								{describe(workspace)}
							</div>
						</div>
						{isActive ? (
							<span className="text-constructive text-xs font-semibold">
								Current
							</span>
						) : (
							<button
								type="button"
								onClick={() => void switchTo(workspace.id)}
								className="bg-accent hover:bg-popover-hover rounded-md border px-3 py-1.5 text-xs font-semibold"
							>
								Switch
							</button>
						)}
					</li>
				);
			})}
		</ul>
	);
}
