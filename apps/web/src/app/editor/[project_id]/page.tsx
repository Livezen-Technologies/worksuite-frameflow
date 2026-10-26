"use client";

import { DownloadImportHost } from "@/tools/components/download-import-host";
import { ProjectSettingsDialog } from "@/project-settings/components/project-settings-dialog";
import { ProjectDefaultsSync } from "@/project-settings/components/project-defaults-sync";
import { PasteAttributesDialog } from "@/tabs/components/paste-attributes-dialog";
import { StartIntentHost } from "@/start/components/start-intent-host";
import { AutoTranscribeHost } from "@/transcript/components/auto-transcribe-host";
import { MotionLinkSync } from "@/motion-studio/components/motion-link-sync";
import { PopoutPanel } from "@/popout/popout-panel";
import { SphereWatcher } from "@/vr/components/sphere-watcher";
import { TranscriptEditor } from "@/transcript/components/transcript-editor";
import { useParams } from "next/navigation";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import { AssetsPanel } from "@/components/editor/panels/assets";
import { PropertiesPanel } from "@/components/editor/panels/properties";
import { Timeline } from "@/timeline/components";
import { PreviewPanel } from "@/preview/components";
import { EditorHeader } from "@/components/editor/editor-header";
import { EditorProvider } from "@/components/providers/editor-provider";
import { Onboarding } from "@/components/editor/onboarding";
import { MigrationDialog } from "@/project/components/migration-dialog";
import { usePanelStore } from "@/editor/panel-store";
import { usePasteMedia } from "@/media/use-paste-media";
import { MobileGate } from "@/components/editor/mobile-gate";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { DockSlotFrame } from "@/dock/components/dock-slot";
import { useDockKeys } from "@/dock/use-dock-keys";
import { useDockStore } from "@/dock/store";
import { isDefaultDock, type DockPanelId, type DockRow, type DockSlot } from "@/dock/layout";
import type { ImperativePanelGroupHandle } from "react-resizable-panels";
import { useWorkspaceStore } from "@/workspaces/store";
import { AudioStudio } from "@/audio-studio/components/audio-studio";
import { useStudioStore } from "@/audio-studio/store";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useEditor } from "@/editor/use-editor";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { ChangelogNotification } from "@/changelog/components/changelog-notification";
import { CloudSyncRunner } from "@/cloud/components/cloud-sync-runner";
import { FootageWatcher } from "@/lut/components/footage-watcher";
import {
	createPreviewOverlayControl,
	isPreviewOverlayVisible,
	mergePreviewOverlaySources,
} from "@/preview/overlays";
import { usePreviewStore } from "@/preview/preview-store";
import { getGuidePreviewOverlaySource } from "@/guides";
import {
	bookmarkNotesPreviewOverlay,
	getBookmarkPreviewOverlaySource,
} from "@/timeline/bookmarks/index";

export default function Editor() {
	const params = useParams();
	const projectId = params.project_id as string;

	return (
		<MobileGate>
			<EditorProvider projectId={projectId}>
				<div className="bg-background flex h-screen w-screen flex-col overflow-hidden">
					<DegradedRendererBanner />
					<EditorHeader />
					<div className="min-h-0 min-w-0 flex-1">
						<EditorOrStudio />
					</div>
					<Onboarding />
					<TranscriptEditor />
					<ProjectSettingsDialog />
					<ProjectDefaultsSync />
					<MigrationDialog />
					<ChangelogNotification />
					<CloudSyncRunner openProjectId={projectId} />
					<FootageWatcher />
					<SphereWatcher />
					<PasteAttributesDialog />
					<StartIntentHost />
					<AutoTranscribeHost />
					<DownloadImportHost />
			<MotionLinkSync />
				</div>
			</EditorProvider>
		</MobileGate>
	);
}

function DegradedRendererBanner() {
	const isDegraded = useEditor((e) => e.renderer.isDegraded);
	const [dismissed, setDismissed] = useState(false);
	if (!isDegraded || dismissed) return null;

	return (
		<div className="bg-accent border-b h-9 flex items-center justify-center gap-2 text-xs text-muted-foreground">
			<span>For the best experience, open Worksuite FrameFlow in Chrome.</span>
			<Button
				variant="text"
				size="icon"
				className="p-0 w-auto [&_svg]:size-3.5"
				onClick={() => setDismissed(true)}
				aria-label="Dismiss"
			>
				<HugeiconsIcon icon={Cancel01Icon} />
			</Button>
		</div>
	);
}

/** The same project in the video editor or the Audio Studio; both edit one timeline. */
function EditorOrStudio() {
	const studio = useStudioStore((s) => s.studio);
	return studio === "audio" ? <AudioStudio /> : <EditorLayout />;
}

function EditorLayout() {
	usePasteMedia();
	const { panels, setPanel, setPanels } = usePanelStore();
	const verticalGroupRef = useRef<ImperativePanelGroupHandle>(null);
	const horizontalGroupRef = useRef<ImperativePanelGroupHandle>(null);
	const workspaceRequest = useWorkspaceStore((s) => s.apply);
	const dock = useDockStore((s) => s.layout);
	const maximized = useDockStore((s) => s.maximized);
	useDockKeys();
	const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);

	// Apply a workspace in place: no remount, so playback, selection and
	// undo history are untouched (SRS WS-02).
	useEffect(() => {
		if (!workspaceRequest) return;
		const { panels: target, tab } = workspaceRequest;
		const apply = () => {
			verticalGroupRef.current?.setLayout([target.mainContent, target.timeline]);
			horizontalGroupRef.current?.setLayout([
				target.tools,
				target.preview,
				target.properties,
			]);
		};
		// Workspaces describe the standard arrangement: put panels back first.
		if (!isDefaultDock(useDockStore.getState().layout) || useDockStore.getState().maximized) {
			setPanels(target);
			useDockStore.getState().reset();
			requestAnimationFrame(apply);
		} else apply();
		setActiveTab(tab);
	}, [workspaceRequest, setActiveTab, setPanels]);
	const activeScene = useEditor((editor) =>
		editor.scenes.getActiveSceneOrNull(),
	);
	const currentTime = useEditor((editor) => editor.playback.getCurrentTime());
	const activeGuide = usePreviewStore((state) => state.activeGuide);
	const overlays = usePreviewStore((state) => state.overlays);
	const setOverlayVisibility = usePreviewStore(
		(state) => state.setOverlayVisibility,
	);
	const showBookmarkNotes = isPreviewOverlayVisible({
		overlay: bookmarkNotesPreviewOverlay,
		overlays,
	});

	const overlaySource = useMemo(
		() =>
			mergePreviewOverlaySources({
				sources: [
					getGuidePreviewOverlaySource({
						guideId: activeGuide,
					}),
					activeScene
						? getBookmarkPreviewOverlaySource({
								bookmarks: activeScene.bookmarks,
								time: currentTime,
								isVisible: showBookmarkNotes,
							})
						: {
								definitions: [bookmarkNotesPreviewOverlay],
								instances: [],
							},
				],
			}),
		[activeGuide, activeScene, currentTime, showBookmarkNotes],
	);

	const overlayControls = useMemo(
		() =>
			overlaySource.definitions.map((overlay) =>
				createPreviewOverlayControl({ overlay, overlays }),
			),
		[overlaySource.definitions, overlays],
	);

	const renderPanel = (id: DockPanelId) => {
		switch (id) {
			case "media":
				return (
					<PopoutPanel id="media">
						<AssetsPanel />
					</PopoutPanel>
				);
			case "preview":
				return (
					<PopoutPanel id="preview">
						<PreviewPanel
							overlayControls={overlayControls}
							overlayInstances={overlaySource.instances}
							onOverlayVisibilityChange={setOverlayVisibility}
						/>
					</PopoutPanel>
				);
			case "properties":
				return (
					<PopoutPanel id="properties">
						<PropertiesPanel />
					</PopoutPanel>
				);
			case "timeline":
				return (
					<PopoutPanel id="timeline">
						<Timeline />
					</PopoutPanel>
				);
		}
	};

	const frame = ({ slot, row, index }: { slot: DockSlot; row: DockRow; index: number }) => (
		<DockSlotFrame slot={slot} row={row} index={index} render={renderPanel} />
	);

	if (maximized)
		return (
			<div className="size-full px-3 pb-3">
				{frame({ slot: { panels: [maximized], active: maximized }, row: "top", index: 0 })}
			</div>
		);

	// The default arrangement keeps the saved sizes and workspace presets (WS-02).
	const standard = isDefaultDock(dock);
	const sizeOf = ({ row, index }: { row: DockRow; index: number }) => {
		if (!standard) return undefined;
		if (row === "bottom") return panels.timeline;
		return [panels.tools, panels.preview, panels.properties][index];
	};

	const rowView = (row: DockRow) => {
		const slots = dock[row];
		if (slots.length === 1) return frame({ slot: slots[0], row, index: 0 });
		return (
			<ResizablePanelGroup
				key={`${row}:${slots.map((s) => s.panels.join("+")).join("|")}`}
				ref={row === "top" ? horizontalGroupRef : undefined}
				direction="horizontal"
				className="size-full gap-[0.19rem]"
				autoSaveId={standard ? undefined : `dock-${row}-${slots.map((s) => s.panels.join("+")).join("|")}`}
				onLayout={(sizes) => {
					if (!standard || row !== "top") return;
					setPanel({ panel: "tools", size: sizes[0] ?? panels.tools });
					setPanel({ panel: "preview", size: sizes[1] ?? panels.preview });
					setPanel({ panel: "properties", size: sizes[2] ?? panels.properties });
				}}
			>
				{slots.map((slot, index) => (
					<Fragment key={slot.panels.join("+")}>
						{index > 0 && <ResizableHandle withHandle />}
						<ResizablePanel
							id={slot.panels.join("+")}
							order={index}
							defaultSize={sizeOf({ row, index }) ?? 100 / slots.length}
							minSize={10}
							className="min-h-0 min-w-0"
						>
							{frame({ slot, row, index })}
						</ResizablePanel>
					</Fragment>
				))}
			</ResizablePanelGroup>
		);
	};

	const rows = (["top", "bottom"] as const).filter((row) => dock[row].length > 0);
	if (rows.length === 1)
		return <div className="size-full px-3 pb-3">{rowView(rows[0])}</div>;

	return (
		<ResizablePanelGroup
			key={standard ? "standard" : "custom"}
			ref={verticalGroupRef}
			direction="vertical"
			className="size-full gap-[0.18rem]"
			autoSaveId={standard ? undefined : "dock-rows"}
			onLayout={(sizes) => {
				if (!standard) return;
				setPanel({
					panel: "mainContent",
					size: sizes[0] ?? panels.mainContent,
				});
				setPanel({
					panel: "timeline",
					size: sizes[1] ?? panels.timeline,
				});
			}}
		>
			<ResizablePanel
				id="dock-top"
				order={0}
				defaultSize={standard ? panels.mainContent : 60}
				minSize={15}
				maxSize={85}
				className="min-h-0 px-3"
			>
				{rowView("top")}
			</ResizablePanel>
			<ResizableHandle withHandle />
			<ResizablePanel
				id="dock-bottom"
				order={1}
				defaultSize={standard ? panels.timeline : 40}
				minSize={15}
				maxSize={85}
				className="min-h-0 px-3 pb-3"
			>
				{rowView("bottom")}
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
