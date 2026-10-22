"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import type { Effect } from "@/effects/types";
import { useEffectLibrary } from "../presets";

/** Saves a clip's effect stack, in order, as a reusable preset (SRS WS-23). */
export function SavePresetButton({ effects }: { effects: Effect[] }) {
	const savePreset = useEffectLibrary((s) => s.savePreset);
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");

	const save = () => {
		const preset = savePreset({
			name,
			effects: effects.map(({ type, params, enabled }) => ({
				type,
				params,
				enabled,
			})),
		});
		toast.success(
			`Saved preset “${preset.name}”. Find it under Effects → My presets.`,
		);
		setOpen(false);
	};

	return (
		<>
			<Button
				variant="ghost"
				size="sm"
				onClick={() => {
					setName("");
					setOpen(true);
				}}
			>
				Save stack as preset
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Save effect stack</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<form
							id="effect-preset-form"
							className="flex flex-col gap-2"
							onSubmit={(event) => {
								event.preventDefault();
								save();
							}}
						>
							<label
								htmlFor="effect-preset-name"
								className="text-muted-foreground text-sm"
							>
								Name
							</label>
							<Input
								id="effect-preset-name"
								value={name}
								maxLength={40}
								placeholder="e.g. Retro look"
								onChange={(event) => setName(event.target.value)}
							/>
							<p className="text-muted-foreground m-0 text-xs">
								{effects.length} effect{effects.length === 1 ? "" : "s"}, in
								this order, with their current settings.
							</p>
						</form>
					</DialogBody>
					<DialogFooter>
						<Button variant="outline" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button
							type="submit"
							form="effect-preset-form"
							disabled={!name.trim()}
						>
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
