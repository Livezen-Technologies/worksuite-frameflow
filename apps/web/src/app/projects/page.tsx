"use client";

import {
	AudioLines,
	ChevronDown,
	Circle,
	Clock,
	Cloud as CloudIcon,
	Download,
	FileOutput,
	House,
	Images,
	LayoutTemplate,
	Lock as LockIcon,
	type LucideIcon,
	MonitorPlay,
	Repeat,
	Settings as SettingsIcon,
	Sparkles,
} from "lucide-react";
import { useWorksuiteAccount } from "@/account/use-worksuite-account";
import { PROJECT_TEMPLATES } from "@/templates/project-templates";
import { useExportHistory } from "@/export/history";
import {
	BUILT_IN_TEMPLATES,
	useProjectSettings,
	type SettingsTemplate,
} from "@/project-settings/store";
import { RestoreSessionBanner } from "@/tabs/components/restore-session";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { EditorCore } from "@/core";
import { MigrationDialog } from "@/project/components/migration-dialog";
import { StoragePersistenceDialog } from "@/services/storage/components/storage-persistence-dialog";
import { Button } from "@/components/ui/button";
import { OpenFolderButton } from "@/project-folder/components/open-folder-button";
import { StartPanel } from "@/start/components/start-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useEditor } from "@/editor/use-editor";
import { useProjectsStore } from "./store";
import type {
	TProjectMetadata,
	TProjectSortKey,
	TProjectSortOption,
} from "@/project/types";
import { formatTimecode, mediaTimeToSeconds } from "opencut-wasm";
import { formatDate } from "@/utils/date";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Calendar04Icon,
	GridViewIcon,
	LeftToRightListDashIcon,
	PlusSignIcon,
	Search01Icon,
	MoreHorizontalIcon,
	Delete02Icon,
	Copy01Icon,
	Edit03Icon,
	ArrowDown02Icon,
	InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { OcVideoIcon } from "@/components/icons";
import { Label } from "@/components/ui/label";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteProjectDialog } from "@/project/components/delete-project-dialog";
import { ProjectInfoDialog } from "@/project/components/project-info-dialog";
import { RenameProjectDialog } from "@/project/components/rename-project-dialog";
import { cn } from "@/utils/ui";
import { ChangelogNotification } from "@/changelog/components/changelog-notification";
import { AccountMenu } from "@/account/components/account-menu";
import {
	OfflineBadge,
	UploadQueueButton,
} from "@/cloud/components/upload-queue";
import { WelcomeScreen } from "@/account/components/welcome-screen";
import { SignInHandoff } from "@/account/components/sign-in-handoff";
import { StorageCard } from "@/account/components/storage-card";
import { BrandMark } from "@/account/components/brand-mark";
import { WorkspaceSwitcher } from "@/account/components/workspace-switcher";
import {
	CloudOnlyProjects,
	ProjectCloudBadge,
} from "@/cloud/components/project-badges";
import { CloudSyncRunner } from "@/cloud/components/cloud-sync-runner";
import { UpdatePrompt } from "@/updates/components/update-prompt";
const formatProjectDuration = ({
	duration,
}: {
	duration: number | undefined;
}): string | null => {
	if (duration === undefined) {
		return null;
	}

	const durationSeconds = mediaTimeToSeconds({ time: duration });
	const format = durationSeconds >= 3600 ? "HH:MM:SS" : "MM:SS";
	return formatTimecode({ time: duration, format }) ?? "";
};

const VIEW_MODE_OPTIONS = [
	{ mode: "grid" as const, icon: GridViewIcon, label: "Grid view" },
	{ mode: "list" as const, icon: LeftToRightListDashIcon, label: "List view" },
];

export default function ProjectsPage() {
	const { searchQuery, sortKey, sortOrder, viewMode } = useProjectsStore();
	const editor = useEditor();
	const sortOption: TProjectSortOption = `${sortKey}-${sortOrder}`;

	const isLoading = useEditor((e) => e.project.getIsLoading());
	const isInitialized = useEditor((e) => e.project.getIsInitialized());
	const projectsToDisplay = useEditor((e) =>
		e.project.getFilteredAndSortedProjects({ searchQuery, sortOption }),
	);

	useEffect(() => {
		if (!editor.project.getIsInitialized()) {
			editor.project.loadAllProjects();
		}
	}, [editor.project]);

	return (
		// Fixed-height shell: header and banner on top, then the sidebar and the
		// page, each scrolling on its own, so the sidebar footer is always in view.
		<div className="bg-background flex h-dvh flex-col overflow-hidden">
			<MigrationDialog />
			<StoragePersistenceDialog />
			<ChangelogNotification />
			<WelcomeScreen />
			<SignInHandoff />
			<CloudSyncRunner />
			<ProjectsHeader />
			<RestoreSessionBanner />
			<div className="flex min-h-0 flex-1">
				<ProjectsSidebar />
				<div className="min-w-0 flex-1 overflow-y-auto" data-start-content>
					<main className="mx-auto flex max-w-[1600px] flex-col gap-6 px-5 pt-8 pb-10 md:px-10">
						<ProjectsTitleBar />
						<StartPanel />
						<CloudOnlyProjects />
						<section id="recent-projects" className="flex scroll-mt-20 flex-col gap-4">
						<ProjectsToolbar projectIds={projectsToDisplay.map((p) => p.id)} />
						{isLoading || !isInitialized ? (
							<ProjectsSkeleton />
						) : projectsToDisplay.length === 0 ? (
							<EmptyState />
						) : (
							<div
								className={
									viewMode === "grid"
										? "xs:grid-cols-2 grid grid-cols-1 gap-6 sm:grid-cols-3 lg:grid-cols-4"
										: "flex flex-col"
								}
							>
								{projectsToDisplay.map((project) => (
									<ProjectItem
										key={project.id}
										project={project}
										allProjectIds={projectsToDisplay.map((p) => p.id)}
									/>
								))}
							</div>
						)}
						</section>
					</main>
				</div>
			</div>
		</div>
	);
}

function ProjectsHeader() {
	return (
		<header className="bg-background sticky top-0 z-20 flex h-[60px] shrink-0 items-center gap-4 border-b px-6">
			<Link href="/projects" className="flex items-center gap-2.5 text-lg font-bold">
				<BrandMark />
				FrameFlow
				<span className="text-muted-foreground border px-1.5 py-0.5 font-mono text-[10px] font-normal tracking-[0.2em]">
					WORKSUITE
				</span>
			</Link>
			<div className="flex flex-1 justify-center">
				<SearchBar className="hidden w-full max-w-xl md:block" shortcut />
			</div>
			<UpdatePrompt />
			<OfflineBadge />
			<UploadQueueButton />
			<AccountMenu />
		</header>
	);
}

function ProjectsSidebar() {
	const editor = useEditor();
	const router = useRouter();
	const { setSearchQuery } = useProjectsStore();
	const projects = useEditor((e) => e.project.getSavedProjects());
	const [motionCount, setMotionCount] = useState(0);
	useEffect(() => {
		let cancelled = false;
		void import("@/motion-studio/storage")
			.then(({ listMotionProjects }) => listMotionProjects())
			.then((list) => !cancelled && setMotionCount(list.length))
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);
	const recordings = projects.filter((p) => /^screen recording/i.test(p.name)).length;
	const exportCount = useExportHistory((s) => s.entries.length);
	const newWithTemplates = async () => {
		const projectId = await editor.project.createNewProject({ name: "New project" });
		const { useStartIntent } = await import("@/start/intent");
		useStartIntent.getState().set({ projectId, intent: { kind: "templates" } });
		router.push(`/editor/${projectId}`);
	};
	const item =
		"text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex h-9 w-full shrink-0 items-center gap-3 px-3 text-left outline-none focus-visible:ring-2";
	return (
		<aside
			className="bg-sidebar hidden h-full min-h-0 w-14 shrink-0 flex-col overflow-hidden border-r text-sm md:flex lg:w-[232px]"
			data-start-sidebar
		>
			<div className="hidden shrink-0 px-3 pt-3 lg:block">
				<WorkspaceSwitcher />
			</div>
			<nav
				aria-label="Projects"
				className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-2 py-3 [scrollbar-width:thin] lg:px-3"
				data-start-nav
			>
			<Link href="/projects" aria-current="page" className="bg-primary/15 text-foreground flex h-9 shrink-0 items-center gap-3 px-3 font-medium">
				<NavLabel icon={House} label="Home" />
			</Link>
			<button
				type="button"
				className={item}
				onClick={() => {
					setSearchQuery({ query: "" });
					document.getElementById("recent-projects")?.scrollIntoView({ behavior: "smooth" });
				}}
			>
				<NavLabel icon={Clock} label="Recent projects" count={projects.length} />
			</button>
			<button type="button" className={item} onClick={() => void newWithTemplates()}>
				<NavLabel icon={LayoutTemplate} label="Templates" count={PROJECT_TEMPLATES.length} />
			</button>
			<Link href="/motion" className={item}>
				<NavLabel icon={Sparkles} label="Motion graphics" count={motionCount} />
			</Link>
			<button
				type="button"
				className={item}
				onClick={() => {
					setSearchQuery({ query: "Screen recording" });
					document.getElementById("recent-projects")?.scrollIntoView({ behavior: "smooth" });
				}}
			>
				<NavLabel icon={MonitorPlay} label="Screen recordings" count={recordings} />
			</button>
			<Link href="/media" className={item}>
				<NavLabel icon={Images} label="Media library" />
			</Link>
			<Link href="/exports" className={item}>
				<NavLabel icon={FileOutput} label="Exports" count={exportCount} />
			</Link>
			<div className="text-muted-foreground mt-3 shrink-0 px-3 pb-1 text-[11px] font-semibold tracking-wider uppercase max-lg:sr-only">Tools</div>
			<div className="bg-border mx-2 my-2 h-px shrink-0 lg:hidden" aria-hidden="true" />
			<button
				type="button"
				className={item}
				onClick={() => {
					const recorder = window.worksuite?.recorder;
					if (recorder) void recorder.open();
					else document.querySelector<HTMLButtonElement>('[data-start="record"]')?.click();
				}}
				data-tool="recorder"
			>
				<NavLabel icon={Circle} label="Screen recorder" />
			</button>
			<button
				type="button"
				className={item}
				data-tool="audio"
				onClick={() =>
					void editor.project
						.createNewProject({ name: "Audio project" })
						.then((id) => router.push(`/editor/${id}?studio=audio`))
				}
			>
				<NavLabel icon={AudioLines} label="Music & Audio Editor" />
			</button>
			<Link href="/tools/convert" className={item} data-tool="convert">
				<NavLabel icon={Repeat} label="Video converter" />
			</Link>
			<Link href="/tools/download" className={item} data-tool="download">
				<NavLabel icon={Download} label="Video downloader" />
			</Link>
			</nav>
			<SidebarFooter />
		</aside>
	);
}

/** One sidebar row: icon, label (hidden in the compact sidebar) and an optional count. */
function NavLabel({ icon: Icon, label, count }: { icon: LucideIcon; label: string; count?: number }) {
	return (
		<span className="flex min-w-0 flex-1 items-center gap-3 max-lg:justify-center" title={label}>
			<Icon className="size-[18px] shrink-0" aria-hidden="true" />
			<span className="truncate max-lg:sr-only">{label}</span>
			{count !== undefined && (
				<span className="text-muted-foreground ml-auto font-mono text-xs max-lg:hidden">{count}</span>
			)}
		</span>
	);
}

/** Always visible under the navigation: storage, where projects live, settings. */
function SidebarFooter() {
	const { state } = useWorksuiteAccount();
	const signedIn = state?.status === "signed-in";
	return (
		<footer className="flex shrink-0 flex-col gap-2 border-t px-3 py-3 text-xs max-lg:items-center max-lg:px-2" data-start-footer>
			<div className="max-lg:hidden">
				<StorageCard />
			</div>
			<div className="flex items-start gap-2" title={signedIn ? "Signed in to WorkSuite" : "Private by default: projects stay on this computer"} data-privacy-state={signedIn ? "signed-in" : "local"}>
				{signedIn ? (
					<CloudIcon className="text-primary mt-0.5 size-3.5 shrink-0" />
				) : (
					<LockIcon className="text-primary mt-0.5 size-3.5 shrink-0" />
				)}
				<span className="flex min-w-0 flex-col gap-0.5 max-lg:hidden">
					<span className="text-foreground font-semibold">{signedIn ? "Signed in to WorkSuite" : "Private by default"}</span>
					<span className="text-muted-foreground leading-snug">
						{signedIn
							? "Projects stay on this computer; back them up to WorkSuite Drive from each project."
							: "Projects stay on this computer. Sign in to back them up to WorkSuite Drive."}
					</span>
				</span>
			</div>
			<Link href="/settings" title="Settings" className="text-muted-foreground hover:bg-accent hover:text-foreground -mx-1 flex h-8 items-center gap-2 px-1">
				<SettingsIcon className="size-[18px] shrink-0" /> <span className="max-lg:hidden">Settings</span>
			</Link>
		</footer>
	);
}

function ProjectsTitleBar() {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-start gap-4">
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<h1 className="m-0 text-3xl font-bold tracking-tight">Start something new</h1>
					<p className="text-muted-foreground">Record, edit and animate. Everything stays on this computer.</p>
				</div>
				<NewProjectButton />
			</div>
			<SearchBar className="block md:hidden" />
		</div>
	);
}

const SORT_LABELS: Record<TProjectSortKey, string> = {
	createdAt: "Created",
	updatedAt: "Modified",
	name: "Name",
	duration: "Duration",
};

function ProjectsToolbar({ projectIds }: { projectIds: string[] }) {
	const {
		selectedProjectIds,
		sortKey,
		sortOrder,
		setSortOrder,
		setSelectedProjects,
		clearSelectedProjects,
		viewMode,
		setViewMode,
	} = useProjectsStore();

	const selectedProjectCount = selectedProjectIds.length;
	const isAllSelected =
		projectIds.length > 0 && selectedProjectCount === projectIds.length;
	const hasSomeSelected =
		selectedProjectCount > 0 && selectedProjectCount < projectIds.length;

	const handleSelectAll = ({ checked }: { checked: boolean }) => {
		if (checked) {
			setSelectedProjects({ projectIds });
			return;
		}
		clearSelectedProjects();
	};

	return (
		<div className="flex flex-wrap items-center gap-3 border-b pb-3" data-recent-toolbar>
			<h2 className="m-0 flex-1 text-xl font-bold">Recent projects</h2>
			{selectedProjectCount > 0 ? <ProjectActions /> : null}
			<div className="flex items-center gap-2">
				<Label
					className="flex items-center gap-3 cursor-pointer px-2"
					htmlFor="select-all-projects"
				>
					<Checkbox
						className="size-5"
						id="select-all-projects"
						checked={
							isAllSelected ? true : hasSomeSelected ? "indeterminate" : false
						}
						onCheckedChange={(checked) =>
							handleSelectAll({ checked: checked === true })
						}
					/>
					<span className="text-muted-foreground hidden md:block">
						Select all
					</span>
				</Label>

				<div className="h-4 w-px bg-border/50" />

				<SortDropdown>
					<Button variant="text" className="text-muted-foreground pl-2">
						{SORT_LABELS[sortKey]}
					</Button>
				</SortDropdown>
				<Button
					variant="text"
					className="text-muted-foreground"
					onClick={() =>
						setSortOrder({
							sortOrder: sortOrder === "asc" ? "desc" : "asc",
						})
					}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							setSortOrder({
								sortOrder: sortOrder === "asc" ? "desc" : "asc",
							});
						}
					}}
					aria-label={`Sort ${sortOrder === "asc" ? "ascending" : "descending"}`}
				>
					<HugeiconsIcon
						icon={ArrowDown02Icon}
						className={sortOrder === "asc" ? "rotate-180" : ""}
					/>
				</Button>

				<div className="flex items-center border">
					{VIEW_MODE_OPTIONS.map(({ mode, icon, label }) => (
						<Button
							key={mode}
							variant="ghost"
							size="icon"
							className={cn(viewMode === mode && "!bg-secondary")}
							onClick={() => setViewMode({ viewMode: mode })}
							aria-label={label}
							aria-pressed={viewMode === mode}
						>
							<HugeiconsIcon icon={icon} className="size-4" />
						</Button>
					))}
				</div>
			</div>
		</div>
	);
}

function SearchBar({
	className,
	collapsed,
	shortcut,
}: {
	className?: string;
	collapsed?: boolean;
	/** Ctrl/Cmd+K focuses this field. */
	shortcut?: boolean;
}) {
	const { searchQuery, setSearchQuery } = useProjectsStore();
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (!shortcut) return;
		const onKey = (e: globalThis.KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				inputRef.current?.focus();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [shortcut]);

	return (
		<>
			{collapsed ? (
				<div className="block md:hidden">
					<Button
						size="icon"
						variant="outline"
						className="size-10.5 rounded-full"
					>
						<HugeiconsIcon icon={Search01Icon} />
					</Button>
				</div>
			) : (
				<div className={cn("relative", className)}>
					<HugeiconsIcon
						icon={Search01Icon}
						className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
						aria-hidden="true"
					/>
					<Input
						ref={inputRef}
						placeholder="Search projects"
						value={searchQuery}
						onChange={(event) => setSearchQuery({ query: event.target.value })}
						size="lg"
						className={cn("pl-9", shortcut && "pr-16")}
						data-projects-search
					/>
					{shortcut && (
						<span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 border px-1.5 py-0.5 font-mono text-[11px]">
							Ctrl K
						</span>
					)}
				</div>
			)}
		</>
	);
}

const PROJECT_ACTIONS = [
	{
		id: "duplicate",
		label: "Duplicate",
		icon: Copy01Icon,
		variant: "outline" as const,
	},
	{
		id: "delete",
		label: "Delete",
		icon: Delete02Icon,
		variant: "destructive-foreground" as const,
	},
] as const;

async function deleteProjects({
	editor,
	ids,
}: {
	editor: EditorCore;
	ids: string[];
}) {
	await editor.project.deleteProjects({ ids });
}

async function duplicateProjects({
	editor,
	ids,
}: {
	editor: EditorCore;
	ids: string[];
}) {
	await editor.project.duplicateProjects({ ids });
}

async function renameProject({
	editor,
	id,
	name,
}: {
	editor: EditorCore;
	id: string;
	name: string;
}) {
	await editor.project.renameProject({ id, name });
}

function ProjectActions() {
	const editor = useEditor();
	const { selectedProjectIds, clearSelectedProjects } = useProjectsStore();
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

	const savedProjects = editor.project.getSavedProjects();
	const selectedProjectNames = savedProjects
		.filter((project) => selectedProjectIds.includes(project.id))
		.map((project) => project.name);

	const handleDuplicate = async () => {
		await duplicateProjects({ editor, ids: selectedProjectIds });
		clearSelectedProjects();
	};

	const handleDeleteClick = () => {
		setIsDeleteDialogOpen(true);
	};

	const handleDeleteConfirm = async () => {
		await deleteProjects({ editor, ids: selectedProjectIds });
		clearSelectedProjects();
		setIsDeleteDialogOpen(false);
	};

	const actionHandlers: Record<string, () => void> = {
		duplicate: handleDuplicate,
		delete: handleDeleteClick,
	};

	return (
		<>
			<div className="flex items-center gap-2.5 px-3">
				<div className="hidden sm:flex items-center gap-2.5">
					{PROJECT_ACTIONS.map((action) => (
						<Button
							key={action.id}
							size="icon"
							variant={action.variant}
							className="size-9"
							onClick={actionHandlers[action.id]}
						>
							<HugeiconsIcon icon={action.icon} />
						</Button>
					))}
				</div>

				<DropdownMenu>
					<DropdownMenuTrigger asChild className="sm:hidden">
						<Button size="icon" variant="outline" className="size-9">
							<HugeiconsIcon icon={MoreHorizontalIcon} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{PROJECT_ACTIONS.map((action) => (
							<DropdownMenuItem
								key={action.id}
								variant={action.id === "delete" ? "destructive" : undefined}
								onClick={actionHandlers[action.id]}
							>
								<HugeiconsIcon icon={action.icon} />
								{action.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<DeleteProjectDialog
				isOpen={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				projectNames={selectedProjectNames}
				onConfirm={handleDeleteConfirm}
			/>
		</>
	);
}

function SortDropdown({ children }: { children: React.ReactNode }) {
	const { sortKey, setSortKey } = useProjectsStore();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent className="w-48" align="center">
				<DropdownMenuCheckboxItem
					checked={sortKey === "createdAt"}
					onCheckedChange={() => setSortKey({ sortKey: "createdAt" })}
				>
					Created
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={sortKey === "updatedAt"}
					onCheckedChange={() => setSortKey({ sortKey: "updatedAt" })}
				>
					Modified
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={sortKey === "name"}
					onCheckedChange={() => setSortKey({ sortKey: "name" })}
				>
					Name
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={sortKey === "duration"}
					onCheckedChange={() => setSortKey({ sortKey: "duration" })}
				>
					Duration
				</DropdownMenuCheckboxItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function NewProjectButton() {
	const editor = useEditor();
	const router = useRouter();

	const templates = useProjectSettings((s) => s.templates);

	const handleCreateProject = async (template?: SettingsTemplate) => {
		const projectId = await editor.project.createNewProject({
			name: "New project",
			settings: template?.settings,
		});
		router.push(`/editor/${projectId}`);
	};

	return (
		<div className="flex gap-2">
			<OpenFolderButton />
			<div className="flex">
				<Button
					size="lg"
					className="flex rounded-r-none px-5 md:px-6"
					onClick={() => void handleCreateProject()}
				>
					<span className="text-sm font-medium hidden md:block">
						New project
					</span>
					<span className="text-sm font-medium block md:hidden">New</span>
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							size="lg"
							className="rounded-l-none border-l border-black/20 px-2"
							aria-label="New project from a template"
							data-new-from-template
						>
							<ChevronDown className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-64">
						{[...BUILT_IN_TEMPLATES, ...templates].map((t) => (
							<DropdownMenuItem
								key={t.id}
								onClick={() => void handleCreateProject(t)}
							>
								{t.name}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

function ProjectItem({
	project,
	allProjectIds,
}: {
	project: TProjectMetadata;
	allProjectIds: string[];
}) {
	const {
		selectedProjectIds,
		viewMode,
		setProjectSelected,
		selectProjectRange,
	} = useProjectsStore();
	const selectedProjectIdSet = new Set(selectedProjectIds);
	const isSelected = selectedProjectIdSet.has(project.id);
	const selectedProjectCount = selectedProjectIds.length;
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
	const editor = useEditor();
	const durationLabel = formatProjectDuration({ duration: project.duration });
	const isMultiSelect = selectedProjectCount > 1;
	const isGridView = viewMode === "grid";

	const handleRename = () => setIsRenameDialogOpen(true);
	const handleDuplicate = async () => {
		await duplicateProjects({ editor, ids: [project.id] });
	};
	const handleDeleteClick = () => setIsDeleteDialogOpen(true);
	const handleInfoClick = () => setIsInfoDialogOpen(true);
	const handleDeleteConfirm = async () => {
		await deleteProjects({ editor, ids: [project.id] });
		setIsDeleteDialogOpen(false);
	};

	const handleCheckboxChange = ({
		checked,
		shiftKey,
	}: {
		checked: boolean;
		shiftKey: boolean;
	}) => {
		if (shiftKey && checked) {
			selectProjectRange({ projectId: project.id, allProjectIds });
			return;
		}
		setProjectSelected({ projectId: project.id, isSelected: checked });
	};

	const gridContent = (
		<Card className="bg-background overflow-hidden border-none p-0">
			<div className="bg-muted relative aspect-video">
				<div className="absolute inset-0">
					{project.thumbnail ? (
						<Image
							src={project.thumbnail}
							alt="Project thumbnail"
							fill
							className="object-cover"
						/>
					) : (
						<div className="flex size-full items-center justify-center">
							<OcVideoIcon className="text-muted-foreground size-12 shrink-0" />
						</div>
					)}
				</div>

				<div className="absolute top-2 left-2">
					<ProjectCloudBadge projectId={project.id} />
				</div>

				{durationLabel && (
					<div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs font-semibold px-2 py-1 rounded-sm">
						{durationLabel}
					</div>
				)}
			</div>

			<CardContent className="flex flex-col gap-2 px-0 pt-4">
				<h3 className="group-hover:text-foreground/90 line-clamp-2 text-sm leading-snug font-medium">
					{project.name}
				</h3>
				<div className="text-muted-foreground flex items-center gap-1.5 text-sm">
					<HugeiconsIcon icon={Calendar04Icon} className="size-4" />
					<span>Created {formatDate({ date: project.createdAt })}</span>
				</div>
			</CardContent>
		</Card>
	);

	const listRowContent = (
		<div className="flex items-center gap-3 flex-1 min-w-0">
			<div className="bg-muted relative size-10 rounded overflow-hidden shrink-0">
				{project.thumbnail ? (
					<Image
						src={project.thumbnail}
						alt="Project thumbnail"
						fill
						className="object-cover"
					/>
				) : (
					<div className="flex size-full items-center justify-center">
						<OcVideoIcon className="text-muted-foreground size-5 shrink-0" />
					</div>
				)}
			</div>

			<h3 className="group-hover:text-foreground/90 text-sm font-medium truncate flex-1 min-w-0">
				{project.name}
			</h3>

			<ProjectCloudBadge projectId={project.id} />

			<span className="text-muted-foreground text-sm shrink-0 hidden sm:block">
				{durationLabel ?? "—"}
			</span>

			<span className="text-muted-foreground text-sm shrink-0 w-auto pl-8 text-right hidden xs:block">
				{formatDate({ date: project.createdAt })}
			</span>
		</div>
	);

	const listContent = (
		<div
			className={`flex items-center gap-4 py-2 px-4 border-b border-border/50 ${
				isSelected ? "bg-primary/5" : ""
			}`}
		>
			<Checkbox
				checked={isSelected}
				onMouseDown={(event) => event.preventDefault()}
				onClick={(event) => {
					handleCheckboxChange({
						checked: !isSelected,
						shiftKey: event.shiftKey,
					});
				}}
				onCheckedChange={() => {}}
				className="size-5 shrink-0"
			/>

			<Link href={`/editor/${project.id}`} className="flex-1 min-w-0">
				{listRowContent}
			</Link>

			{!isMultiSelect && (
				<ProjectMenu
					isOpen={isDropdownOpen}
					onOpenChange={setIsDropdownOpen}
					variant="list"
					onRenameClick={handleRename}
					onDuplicateClick={handleDuplicate}
					onDeleteClick={handleDeleteClick}
					onInfoClick={handleInfoClick}
				/>
			)}
		</div>
	);

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div className="group relative">
						{isGridView ? (
							<>
								<Link href={`/editor/${project.id}`} className="block">
									{gridContent}
								</Link>

								<Checkbox
									checked={isSelected}
									onMouseDown={(event) => event.preventDefault()}
									onClick={(event) => {
										handleCheckboxChange({
											checked: !isSelected,
											shiftKey: event.shiftKey,
										});
									}}
									onCheckedChange={() => {}}
									className={`absolute z-10 size-5 top-3 left-3 ${
										isSelected || isDropdownOpen
											? "opacity-100"
											: "opacity-0 group-hover:opacity-100"
									}`}
								/>

								{!isMultiSelect && (
									<ProjectMenu
										isOpen={isDropdownOpen}
										onOpenChange={setIsDropdownOpen}
										onRenameClick={handleRename}
										onDuplicateClick={handleDuplicate}
										onDeleteClick={handleDeleteClick}
										onInfoClick={handleInfoClick}
									/>
								)}
							</>
						) : (
							listContent
						)}
					</div>
				</ContextMenuTrigger>
				<ProjectContextMenuContent
					onRenameClick={handleRename}
					onDuplicateClick={handleDuplicate}
					onDeleteClick={handleDeleteClick}
					onInfoClick={handleInfoClick}
				/>
			</ContextMenu>

			<RenameProjectDialog
				isOpen={isRenameDialogOpen}
				onOpenChange={setIsRenameDialogOpen}
				projectName={project.name}
				onConfirm={async (newName) => {
					await renameProject({ editor, id: project.id, name: newName });
					setIsRenameDialogOpen(false);
				}}
			/>

			<DeleteProjectDialog
				isOpen={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				projectNames={[project.name]}
				onConfirm={handleDeleteConfirm}
			/>

			<ProjectInfoDialog
				isOpen={isInfoDialogOpen}
				onOpenChange={setIsInfoDialogOpen}
				project={project}
			/>
		</>
	);
}

function ProjectContextMenuContent({
	onRenameClick,
	onDuplicateClick,
	onDeleteClick,
	onInfoClick,
}: {
	onRenameClick: () => void;
	onDuplicateClick: () => void;
	onDeleteClick: () => void;
	onInfoClick: () => void;
}) {
	return (
		<ContextMenuContent>
			<ContextMenuItem
				icon={<HugeiconsIcon icon={Edit03Icon} />}
				onClick={onRenameClick}
			>
				Rename
			</ContextMenuItem>
			<ContextMenuItem
				icon={<HugeiconsIcon icon={Copy01Icon} />}
				onClick={onDuplicateClick}
			>
				Duplicate
			</ContextMenuItem>
			<ContextMenuItem
				icon={<HugeiconsIcon icon={InformationCircleIcon} />}
				onClick={onInfoClick}
			>
				Info
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem
				variant="destructive"
				icon={<HugeiconsIcon icon={Delete02Icon} />}
				onClick={onDeleteClick}
			>
				Delete
			</ContextMenuItem>
		</ContextMenuContent>
	);
}

function ProjectMenu({
	isOpen,
	onOpenChange,
	variant = "grid",
	onRenameClick,
	onDuplicateClick,
	onDeleteClick,
	onInfoClick,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	variant?: "grid" | "list";
	onRenameClick: () => void;
	onDuplicateClick: () => void;
	onDeleteClick: () => void;
	onInfoClick: () => void;
}) {
	const handleMenuClick = ({
		event,
	}: {
		event: MouseEvent<HTMLButtonElement>;
	}) => {
		event.preventDefault();
		event.stopPropagation();
	};

	const handleMenuKeyDown = ({
		event,
	}: {
		event: KeyboardEvent<HTMLButtonElement>;
	}) => {
		if (event.key !== "Enter" && event.key !== " ") {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
	};

	const handleRename = () => {
		onRenameClick();
		onOpenChange(false);
	};

	const handleDuplicate = () => {
		onDuplicateClick();
		onOpenChange(false);
	};

	const handleDeleteClick = () => {
		onDeleteClick();
		onOpenChange(false);
	};

	const handleInfoClick = () => {
		onInfoClick();
		onOpenChange(false);
	};

	const isGrid = variant === "grid";

	return (
		<DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="background"
					className={
						isGrid
							? `absolute z-10 top-3 right-3 ${isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`
							: "!bg-transparent !shadow-none"
					}
					size="icon"
					aria-label="Project menu"
					onClick={(event) =>
						handleMenuClick({
							event: event as unknown as MouseEvent<HTMLButtonElement>,
						})
					}
					onMouseDown={(event) => event.stopPropagation()}
					onKeyDown={(event) =>
						handleMenuKeyDown({
							event: event as unknown as KeyboardEvent<HTMLButtonElement>,
						})
					}
				>
					<HugeiconsIcon
						icon={MoreHorizontalIcon}
						className="text-foreground"
						aria-hidden="true"
					/>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-48" align="end">
				<DropdownMenuItem onClick={handleRename}>
					<HugeiconsIcon icon={Edit03Icon} />
					Rename
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleDuplicate}>
					<HugeiconsIcon icon={Copy01Icon} />
					Duplicate
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleInfoClick}>
					<HugeiconsIcon icon={InformationCircleIcon} />
					Info
				</DropdownMenuItem>
				<DropdownMenuItem variant="destructive" onClick={handleDeleteClick}>
					<HugeiconsIcon icon={Delete02Icon} />
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ProjectsSkeleton() {
	const skeletonIds = Array.from(
		{ length: 24 },
		(_, index) => `skeleton-${index}`,
	);

	return (
		<div className="px-4 xs:grid-cols-2 grid grid-cols-1 gap-6 sm:grid-cols-3 lg:grid-cols-4">
			{skeletonIds.map((skeletonId) => (
				<Card
					key={skeletonId}
					className="bg-background overflow-hidden border-none p-0"
				>
					<div className="bg-muted relative aspect-video">
						<div className="absolute inset-0">
							<Skeleton className="bg-muted/50 size-full" />
						</div>
					</div>
					<CardContent className="flex flex-col gap-2 px-0 pt-4">
						<Skeleton className="bg-muted/50 h-4 w-3/4" />
						<div className="text-muted-foreground flex items-center gap-1.5">
							<Skeleton className="bg-muted/50 size-4" />
							<Skeleton className="bg-muted/50 h-4 w-24" />
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function EmptyState() {
	const { searchQuery, setSearchQuery } = useProjectsStore();
	const router = useRouter();
	const editor = useEditor();
	const savedProjects = editor.project.getSavedProjects();

	const handleCreateProject = async () => {
		try {
			const projectId = await editor.project.createNewProject({
				name: "New project",
			});
			router.push(`/editor/${projectId}`);
		} catch (error) {
			toast.error("Failed to create project", {
				description:
					error instanceof Error ? error.message : "Please try again",
			});
		}
	};

	if (savedProjects.length > 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-5 py-16 text-center">
				<div className="flex flex-col items-center gap-8">
					<HugeiconsIcon
						icon={Search01Icon}
						className="text-muted-foreground size-16 bg-accent/35 border rounded-md p-4"
					/>
					<div className="flex flex-col items-center gap-3">
						<h3 className="text-lg font-medium">No results found</h3>
						<p className="text-muted-foreground max-w-md">
							Your search for "{searchQuery}" did not return any results.
						</p>
					</div>
				</div>
				<Button
					onClick={() => setSearchQuery({ query: "" })}
					variant="outline"
					size="lg"
				>
					Clear search
				</Button>
			</div>
		);
	}

	return (
		<div className="bg-card flex flex-col items-center gap-6 border p-6 text-center md:flex-row md:p-8 md:text-left" data-projects-empty>
			<div className="hidden gap-3 lg:flex" aria-hidden>
				{[0, 1, 2].map((i) => (
					<span key={i} className="border-primary/40 h-16 w-24 border border-dashed" />
				))}
			</div>
			<div className="flex flex-1 flex-col gap-1">
				<h3 className="text-lg font-semibold">No projects yet</h3>
				<p className="text-muted-foreground">
					Start your first project. Import media, edit and export your videos, all privately on this computer.
				</p>
			</div>
			<Button size="lg" className="gap-2" onClick={handleCreateProject}>
				<HugeiconsIcon icon={PlusSignIcon} />
				Create your first project
			</Button>
		</div>
	);
}
