"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useEditor } from "@/editor/use-editor";
import { windowsBridge } from "../bridge";
import { useWindowState } from "../store";

/**
 * Keeps one window per project (MP-08), follows "move back to the main
 * window" (MP-04), saves before the window closes and asks only when a
 * save fails (MP-11).
 */
export function WindowHost() {
	const router = useRouter();
	const editor = useEditor();
	const projectId = useEditor(
		(e) => e.project.getActiveOrNull()?.metadata.id ?? null,
	);
	const saveFailed = useWindowState((s) => s.saveFailed);
	const setState = useWindowState((s) => s.set);

	useEffect(() => {
		const bridge = windowsBridge();
		if (!bridge) return;
		void bridge.isMain().then((isMain) => setState({ isMain }));
		return bridge.onNavigate((url) => router.push(url));
	}, [router, setState]);

	useEffect(() => {
		const bridge = windowsBridge();
		if (!bridge) return;
		void bridge.report({ projectId }).then(({ ok }) => {
			if (ok || !projectId) return;
			toast.info("That project is open in another window", {
				description: "Switched to that window.",
			});
			router.push("/projects");
		});
	}, [projectId, router]);

	// Closing the window: finish saving first (MP-11).
	useEffect(() => {
		let closing = false;
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			if (closing || !editor.save.getIsDirty()) return;
			event.preventDefault();
			event.returnValue = "";
			closing = true;
			void editor.save
				.flush()
				.then(() => window.close())
				.catch((error: unknown) => {
					closing = false;
					setState({
						saveFailed: {
							projectId: editor.project.getActiveOrNull()?.metadata.id ?? "",
							error: error instanceof Error ? error.message : String(error),
							then: () => {
								closing = true;
								window.close();
							},
						},
					});
				});
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, [editor, setState]);

	if (!saveFailed) return null;
	const dismiss = () => setState({ saveFailed: null });
	return (
		<Dialog open onOpenChange={(open) => !open && dismiss()}>
			<DialogContent className="max-w-md" data-save-failed>
				<DialogHeader>
					<DialogTitle>Your latest changes aren&apos;t saved</DialogTitle>
				</DialogHeader>
				<p className="text-muted-foreground text-sm">
					Saving failed: {saveFailed.error}. Try again, leave without the latest
					changes, or stay here.
				</p>
				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={dismiss}>
						Cancel
					</Button>
					<Button
						variant="outline"
						onClick={() => {
							dismiss();
							saveFailed.then();
						}}
					>
						Don&apos;t save
					</Button>
					<Button
						onClick={() =>
							void editor.save
								.flush()
								.then(() => {
									dismiss();
									saveFailed.then();
								})
								.catch((e: unknown) =>
									toast.error("Still can't save", {
										description: e instanceof Error ? e.message : String(e),
									}),
								)
						}
					>
						Save
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
