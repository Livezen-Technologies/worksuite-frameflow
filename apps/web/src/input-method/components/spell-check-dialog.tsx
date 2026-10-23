"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { isDictionaryWord, loadDictionary } from "../candidates";
import { lastTextField, replaceInField } from "../controller";
import { findMisspellings, languageOf, type Misspelling } from "../spell";
import { useInputMethod } from "../store";

/**
 * Spell check of the text field last typed in (TI-13): unknown Sinhala or
 * Tamil words with the closest dictionary words; replace, or add a word.
 */
export function SpellCheckDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	const [found, setFound] = useState<Misspelling[] | null>(null);
	const [note, setNote] = useState("");
	const customWords = useInputMethod((s) => s.customWords);
	const addCustomWord = useInputMethod((s) => s.addCustomWord);

	const check = useCallback(async () => {
		const field = lastTextField();
		const text = field?.value ?? "";
		const language = languageOf(text);
		// Load before any state changes, so opening never renders twice in a row.
		await loadDictionary(language ?? "si");
		if (!field || !language) {
			setFound([]);
			setNote("Click into a text box with Sinhala or Tamil text first.");
			return;
		}
		const { customWords: own, learned } = useInputMethod.getState();
		const picked = new Set(Object.values(learned).flatMap((byWord) => Object.keys(byWord)));
		const isKnown = (word: string) =>
			isDictionaryWord({ language, word }) || own.includes(word) || picked.has(word);
		const result = findMisspellings({ text, language, isKnown });
		setFound(result);
		setNote(result.length ? "" : "No unknown words.");
	}, []);


	const replaceWord = ({ item, word }: { item: Misspelling; word: string }) => {
		const field = lastTextField();
		if (!field) return;
		// Find it again: earlier replacements may have moved it.
		const at = field.value.indexOf(item.word, Math.max(0, item.start - 40));
		if (at < 0) return;
		replaceInField({ field, start: at, end: at + item.word.length, text: word });
		void check();
	};

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
		>
			<DialogContent className="max-w-md" data-spell-check onOpenAutoFocus={() => void check()}>
				<DialogHeader>
					<DialogTitle>Check spelling</DialogTitle>
				</DialogHeader>
				<DialogBody className="flex flex-col gap-2">
					{note && <p className="text-muted-foreground text-sm">{note}</p>}
					{found?.map((item) => (
						<div key={`${item.word}-${item.start}`} className="flex flex-wrap items-center gap-1.5 rounded-md border p-2" data-misspelling={item.word}>
							<span className="text-destructive font-medium underline decoration-wavy">{item.word}</span>
							<span className="text-muted-foreground text-xs">→</span>
							{item.suggestions.length === 0 && (
								<span className="text-muted-foreground text-xs">no close words</span>
							)}
							{item.suggestions.map((word) => (
								<Button key={word} size="sm" variant="outline" data-suggestion={word} onClick={() => replaceWord({ item, word })}>
									{word}
								</Button>
							))}
							<Button
								size="sm"
								variant="text"
								className="ml-auto"
								onClick={() => {
									addCustomWord(item.word);
									void check();
								}}
							>
								Add to dictionary
							</Button>
						</div>
					))}
					<p className="text-muted-foreground text-[11px]">
						{customWords.length} word{customWords.length === 1 ? "" : "s"} of your own. Word lists: Sinhala from
						FrequencyWords (CC BY-SA 4.0), Tamil from open-tamil (MIT).
					</p>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
