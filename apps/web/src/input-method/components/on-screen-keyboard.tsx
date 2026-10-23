"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/utils/ui";
import { typeIntoLastField } from "../controller";

const HAL = "්";
const ZWJ = "‍";

const SINHALA_ROWS = [
	["අ", "ආ", "ඇ", "ඈ", "ඉ", "ඊ", "උ", "ඌ", "එ", "ඒ", "ඔ", "ඕ", "ඓ", "ඖ"],
	["ක", "ඛ", "ග", "ඝ", "ඞ", "ඟ", "ච", "ඡ", "ජ", "ඣ", "ඤ", "ඥ"],
	["ට", "ඨ", "ඩ", "ඪ", "ණ", "ඬ", "ත", "ථ", "ද", "ධ", "න", "ඳ"],
	["ප", "ඵ", "බ", "භ", "ම", "ඹ", "ය", "ර", "ල", "ව", "ශ", "ෂ", "ස", "හ", "ළ", "ෆ"],
	[HAL, "ා", "ැ", "ෑ", "ි", "ී", "ු", "ූ", "ෘ", "ෙ", "ේ", "ෛ", "ො", "ෝ", "ෞ", "ං", "ඃ"],
	[HAL + ZWJ + "ය", HAL + ZWJ + "ර", "ර" + HAL + ZWJ],
];

const TAMIL_ROWS = [
	["அ", "ஆ", "இ", "ஈ", "உ", "ஊ", "எ", "ஏ", "ஐ", "ஒ", "ஓ", "ஔ", "ஃ"],
	["க", "ங", "ச", "ஞ", "ட", "ண", "த", "ந", "ப", "ம"],
	["ய", "ர", "ல", "வ", "ழ", "ள", "ற", "ன", "ஜ", "ஷ", "ஸ", "ஹ"],
	["்", "ா", "ி", "ீ", "ு", "ூ", "ெ", "ே", "ை", "ொ", "ோ", "ௌ"],
];

/** Click-to-type Sinhala and Tamil letters into the last text field (TI-04). */
export function OnScreenKeyboard() {
	const [script, setScript] = useState<"si" | "ta">("si");
	const rows = script === "si" ? SINHALA_ROWS : TAMIL_ROWS;
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title="On-screen keyboard"
					onMouseDown={(event) => event.preventDefault()}
				>
					⌨
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-auto p-2"
				align="end"
				onOpenAutoFocus={(event) => event.preventDefault()}
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<div className="mb-2 flex gap-1">
					{(["si", "ta"] as const).map((s) => (
						<Button
							key={s}
							size="sm"
							variant={script === s ? "secondary" : "ghost"}
							onClick={() => setScript(s)}
						>
							{s === "si" ? "සිංහල" : "தமிழ்"}
						</Button>
					))}
				</div>
				<div className="flex flex-col gap-1">
					{rows.map((row) => (
						<div key={row.join("")} className="flex flex-wrap gap-1">
							{row.map((char) => (
								<button
									key={char}
									type="button"
									onMouseDown={(event) => event.preventDefault()}
									className={cn(
										"bg-accent hover:bg-primary/20 h-8 min-w-8 rounded px-1 text-base",
									)}
									onClick={() => typeIntoLastField({ text: char })}
								>
									{/[්-ෟா-்]/.test(char[0]) ? `◌${char}` : char}
								</button>
							))}
						</div>
					))}
					<div className="flex gap-1">
						<button
							type="button"
									onMouseDown={(event) => event.preventDefault()}
							className="bg-accent hover:bg-primary/20 h-8 flex-1 rounded text-xs"
							onClick={() => typeIntoLastField({ text: " " })}
						>
							Space
						</button>
						<button
							type="button"
									onMouseDown={(event) => event.preventDefault()}
							className="bg-accent hover:bg-primary/20 h-8 w-16 rounded text-xs"
							onClick={() => typeIntoLastField({ text: "\b" })}
						>
							⌫
						</button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
