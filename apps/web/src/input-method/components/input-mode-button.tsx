"use client";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MODE_LABELS, useInputMethod, type InputMode, type SinhalaLayout } from "../store";
import { OnScreenKeyboard } from "./on-screen-keyboard";

const MODES: InputMode[] = ["en", "si", "ta"];
const LAYOUTS: SinhalaLayout[] = ["singlish", "wijesekara"];

/** Shows and switches the typing language (TI-01); Ctrl/Cmd+Shift+L cycles it. */
export function InputModeButton({ className }: { className?: string }) {
	const im = useInputMethod();
	return (
		<div className="flex items-center gap-0.5">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className={className}
						title="Typing language (Ctrl+Shift+L)"
						onMouseDown={(event) => event.preventDefault()}
					>
						{MODE_LABELS[im.mode]}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-60">
					<DropdownMenuLabel>Typing language</DropdownMenuLabel>
					<DropdownMenuRadioGroup
						value={im.mode}
						onValueChange={(v) => {
							const mode = MODES.find((m) => m === v);
							if (mode) im.setMode(mode);
						}}
					>
						<DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="si">සිංහල (Sinhala)</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="ta">தமிழ் (Tamil)</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
					<DropdownMenuSeparator />
					<DropdownMenuLabel>Sinhala keyboard</DropdownMenuLabel>
					<DropdownMenuRadioGroup
						value={im.sinhalaLayout}
						onValueChange={(v) => {
							const layout = LAYOUTS.find((l) => l === v);
							if (layout) im.setSinhalaLayout(layout);
						}}
					>
						<DropdownMenuRadioItem value="singlish">Singlish (phonetic)</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="wijesekara">Wijesekara</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
					<DropdownMenuSeparator />
					<DropdownMenuCheckboxItem
						checked={im.suggestions}
						onCheckedChange={(v) => im.setSuggestions(v === true)}
					>
						Show suggestions
					</DropdownMenuCheckboxItem>
					<DropdownMenuCheckboxItem
						checked={false}
						disabled={Object.keys(im.learned).length === 0}
						onCheckedChange={() => im.clearLearned()}
					>
						Forget learned words ({Object.keys(im.learned).length})
					</DropdownMenuCheckboxItem>
					<DropdownMenuSeparator />
					<p className="text-muted-foreground px-2 py-1 text-xs leading-snug">
						Type as it sounds: ayubowan → ආයුබෝවන්. Numbers or arrows pick a
						suggestion, Space accepts. Shift+Space or `backticks` keep English.
					</p>
				</DropdownMenuContent>
			</DropdownMenu>
			<OnScreenKeyboard />
		</div>
	);
}
