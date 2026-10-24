"use client";

import { caretRect } from "./caret";
import { create } from "zustand";
import { toast } from "sonner";
import { nextWordSuggestions, suggest, wordBefore } from "./candidates";
import { legacyToUnicode, looksLikeLegacy } from "./legacy";
import { useInputMethod } from "./store";
import { isTamil99Key, tamil99FromKeys } from "./tamil99";
import { editableField, type TextFieldLike } from "./editable";

/** Layouts that type letters key by key, with no suggestions (Wijesekara, Tamil99). */
function directLayout(): "wijesekara" | "tamil99" | null {
	const { mode, sinhalaLayout, tamilLayout } = useInputMethod.getState();
	if (mode === "si" && sinhalaLayout === "wijesekara") return "wijesekara";
	if (mode === "ta" && tamilLayout === "tamil99") return "tamil99";
	return null;
}

/**
 * The in-app input method (SRS TI-01 – TI-06, TI-09, TI-20). Listens to
 * keys on every text field of a document, keeps the Latin typed for the
 * current word, and replaces the word in the field with its Sinhala or
 * Tamil spelling as each key lands, so no OS keyboard is needed.
 */

type Field = HTMLInputElement | HTMLTextAreaElement | TextFieldLike;

/** An input, textarea or contentEditable element the input method can type into. */
export function toField(target: EventTarget | null): Field | null {
	return isTextField(target) ? target : editableField(target);
}

interface Composition {
	field: Field;
	start: number;
	keys: string;
	inserted: string;
}

interface CandidateState {
	candidates: string[];
	selected: number;
	latin: string;
	/** Under the caret; `above` is where to flip to when there's no room below. */
	anchor: { left: number; top: number; above: number } | null;
	doc: Document | null;
}

export const useCandidates = create<CandidateState>()(() => ({
	candidates: [],
	selected: 0,
	latin: "",
	anchor: null,
	doc: null,
}));

let composition: Composition | null = null;
/** Showing next-word picks after a finished word (TI-12). */
let following: { field: Field; at: number } | null = null;
let literal = false;
let lastField: Field | null = null;

/** The text field that last had focus, for spell check (TI-13). */
export function lastTextField(): Field | null {
	return lastField?.isConnected ? lastField : null;
}

/** Replaces a range of a field's text as if typed, so undo and React see it. */
export function replaceInField({ field, start, end, text }: { field: Field; start: number; end: number; text: string }) {
	field.focus();
	replace({ field, start, end, text });
}

/** Types text into the field that last had focus (on-screen keyboard, TI-04). */
export function typeIntoLastField({ text }: { text: string }) {
	const field = lastField;
	if (!field || !field.isConnected) return;
	field.focus();
	if (text === "\b") {
		const start = field.selectionStart ?? field.value.length;
		const end = field.selectionEnd ?? start;
		if (start !== end) replace({ field, start, end, text: "" });
		else if (start > 0) replace({ field, start: start - 1, end: start, text: "" });
		return;
	}
	insert({ field, text });
}

const TEXT_TYPES = new Set(["text", "search", ""]);

export function isTextField(
	target: EventTarget | null,
): target is HTMLInputElement | HTMLTextAreaElement {
	// Tag checks rather than instanceof: pop-out windows have their own globals.
	if (!target || !("tagName" in target)) return false;
	const readOnly = "readOnly" in target && target.readOnly === true;
	if (target.tagName === "TEXTAREA") return !readOnly;
	if (target.tagName !== "INPUT") return false;
	const type = "type" in target ? String(target.type) : "";
	const optedOut =
		"dataset" in target &&
		typeof target.dataset === "object" &&
		target.dataset !== null &&
		"noInputMethod" in target.dataset;
	return TEXT_TYPES.has(type) && !readOnly && !optedOut;
}

function replace({ field, start, end, text }: { field: Field; start: number; end: number; text: string }) {
	field.setRangeText(text, start, end, "end");
	field.dispatchEvent(new Event("input", { bubbles: true }));
}

function showNextWords({ field }: { field: Field }) {
	const { suggestions, nextWords } = useInputMethod.getState();
	if (!suggestions) return;
	const at = field.selectionStart ?? field.value.length;
	const previous = wordBefore({ text: field.value, at });
	const words = nextWordSuggestions({ previous, nextWords });
	if (words.length === 0) return;
	following = { field, at };
	const caret = caretRect(field);
	useCandidates.setState({
		candidates: words,
		selected: 0,
		latin: "",
		anchor: { left: caret.left, top: caret.bottom + 4, above: caret.top - 4 },
		doc: field.ownerDocument,
	});
}

function clearCandidates() {
	following = null;
	useCandidates.setState({ candidates: [], selected: 0, latin: "", anchor: null });
}

function showCandidates({ comp }: { comp: Composition }) {
	const { mode, suggestions, learned, keepEnglish } = useInputMethod.getState();
	if (!suggestions || mode === "en" || directLayout()) {
		clearCandidates();
		return;
	}
	let candidates = suggest({ latin: comp.keys, language: mode, learned });
	const english = keepEnglish.some((w) => w.toLowerCase() === comp.keys.toLowerCase());
	candidates = english
		? [comp.keys, ...candidates.slice(0, 4)]
		: [...candidates.slice(0, 5), comp.keys];
	const caret = caretRect(comp.field);
	useCandidates.setState({
		candidates,
		selected: 0,
		latin: comp.keys,
		anchor: { left: caret.left, top: caret.bottom + 4, above: caret.top - 4 },
		doc: comp.field.ownerDocument,
	});
}

function render({ comp }: { comp: Composition }): string {
	const direct = directLayout();
	if (direct === "wijesekara") return legacyToUnicode({ text: comp.keys });
	if (direct === "tamil99") return tamil99FromKeys({ keys: comp.keys });
	const first = useCandidates.getState().candidates[0];
	return first ?? comp.keys;
}

function update({ comp }: { comp: Composition }) {
	showCandidates({ comp });
	const text = render({ comp });
	replace({
		field: comp.field,
		start: comp.start,
		end: comp.start + comp.inserted.length,
		text,
	});
	comp.inserted = text;
}

/** Ends the word, writing `word` (or what is showing) and learning the pick. */
export function commit({ word }: { word?: string } = {}) {
	const comp = composition;
	composition = null;
	if (!comp) return;
	const chosen = word ?? comp.inserted;
	if (chosen !== comp.inserted)
		replace({
			field: comp.field,
			start: comp.start,
			end: comp.start + comp.inserted.length,
			text: chosen,
		});
	if (chosen !== comp.keys && useCandidates.getState().candidates.length > 1)
		useInputMethod.getState().learn({ latin: comp.keys, word: chosen });
	const previous = wordBefore({ text: comp.field.value, at: comp.start });
	if (previous && chosen) useInputMethod.getState().learnNext({ previous, word: chosen });
	clearCandidates();
}

function insertNextWord({ field, previous, word }: { field: Field; previous: string; word: string }) {
	insert({ field, text: `${word} ` });
	if (previous) useInputMethod.getState().learnNext({ previous, word });
	showNextWords({ field });
}

export function pickCandidate({ index }: { index: number }) {
	const word = useCandidates.getState().candidates[index];
	if (following && !composition && word !== undefined) {
		const { field } = following;
		clearCandidates();
		field.focus();
		insertNextWord({ field, previous: wordBefore({ text: field.value, at: field.selectionStart ?? 0 }), word });
		return;
	}
	if (word !== undefined) commit({ word });
	composition?.field.focus();
}

function insert({ field, text }: { field: Field; text: string }) {
	const start = field.selectionStart ?? field.value.length;
	const end = field.selectionEnd ?? start;
	replace({ field, start, end, text });
}

function stillComposing({ field }: { field: Field }): boolean {
	if (!composition) return false;
	if (composition.field !== field) return false;
	return field.selectionStart === composition.start + composition.inserted.length;
}

export function handleKeyDown(event: KeyboardEvent) {
	const store = useInputMethod.getState();
	if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "KeyL") {
		event.preventDefault();
		event.stopPropagation();
		commit();
		store.cycleMode();
		return;
	}
	const field = toField(event.target);
	if (!field || store.mode === "en" || event.isComposing) return;
	if (event.ctrlKey || event.metaKey || event.altKey) {
		commit();
		return;
	}
	// Next-word picks: a number inserts that word, anything else carries on.
	if (following && !composition) {
		const pick = /^[1-9]$/.test(event.key)
			? useCandidates.getState().candidates[Number(event.key) - 1]
			: undefined;
		const here = following.field === field && field.selectionStart === following.at;
		clearCandidates();
		if (pick && here) {
			event.preventDefault();
			event.stopPropagation();
			const previous = wordBefore({ text: field.value, at: field.selectionStart ?? 0 });
			insertNextWord({ field, previous, word: pick });
			return;
		}
	}
	if (composition && !stillComposing({ field })) {
		composition = null;
		clearCandidates();
	}
	const key = event.key;
	const { candidates, selected } = useCandidates.getState();
	const direct = directLayout();
	const wijesekara = direct === "wijesekara";

	if (key === "`" && !direct) {
		event.preventDefault();
		commit();
		literal = !literal;
		return;
	}
	if (literal) return;

	const stop = () => {
		event.preventDefault();
		event.stopPropagation();
	};
	const isInputKey = wijesekara
		? key.length === 1 && key !== " "
		: direct === "tamil99"
			? isTamil99Key(key)
			: /^[A-Za-z]$/.test(key);

	if (isInputKey) {
		stop();
		if (!composition) {
			const start = field.selectionStart ?? field.value.length;
			const end = field.selectionEnd ?? start;
			if (end !== start) replace({ field, start, end, text: "" });
			composition = { field, start, keys: "", inserted: "" };
		}
		composition.keys += key;
		update({ comp: composition });
		return;
	}
	if (!composition) return;

	if (/^[1-9]$/.test(key) && candidates.length > 0) {
		const word = candidates[Number(key) - 1];
		if (word !== undefined) {
			stop();
			commit({ word });
		}
		return;
	}
	if ((key === "ArrowDown" || key === "ArrowUp") && candidates.length > 1) {
		stop();
		const next =
			(selected + (key === "ArrowDown" ? 1 : candidates.length - 1)) % candidates.length;
		useCandidates.setState({ selected: next });
		const comp = composition;
		replace({
			field: comp.field,
			start: comp.start,
			end: comp.start + comp.inserted.length,
			text: candidates[next],
		});
		comp.inserted = candidates[next];
		return;
	}
	if (key === "Backspace") {
		stop();
		const comp = composition;
		comp.keys = comp.keys.slice(0, -1);
		if (comp.keys === "") {
			replace({ field, start: comp.start, end: comp.start + comp.inserted.length, text: "" });
			composition = null;
			clearCandidates();
			return;
		}
		update({ comp });
		return;
	}
	if (key === "Escape") {
		stop();
		commit({ word: composition.keys });
		return;
	}
	if (key === " ") {
		stop();
		// Shift+Space keeps the word in English (TI-06).
		const word = event.shiftKey ? composition.keys : undefined;
		commit(word === undefined ? {} : { word });
		insert({ field, text: " " });
		showNextWords({ field });
		return;
	}
	if (key === "Enter" && candidates.length > 0) {
		stop();
		commit();
		return;
	}
	commit();
}

export function handlePaste(event: ClipboardEvent) {
	const field = toField(event.target);
	if (!field) return;
	const text = event.clipboardData?.getData("text/plain") ?? "";
	if (!text || !looksLikeLegacy({ text })) return;
	event.preventDefault();
	const start = field.selectionStart ?? field.value.length;
	const end = field.selectionEnd ?? start;
	const converted = legacyToUnicode({ text });
	replace({ field, start, end, text: converted });
	toast("Converted legacy Sinhala text to Unicode", {
		action: {
			label: "Undo",
			onClick: () =>
				replace({ field, start, end: start + converted.length, text }),
		},
	});
}

/** Adds the input method to a document; returns the remover. */
export function installInputMethod({ doc }: { doc: Document }): () => void {
	const onFocus = (event: FocusEvent) => {
		const field = toField(event.target);
		if (field) lastField = field;
	};
	const onBlur = (event: FocusEvent) => {
		if (composition && toField(event.target) === composition.field) commit();
	};
	doc.addEventListener("keydown", handleKeyDown, true);
	doc.addEventListener("paste", handlePaste, true);
	doc.addEventListener("focusout", onBlur, true);
	doc.addEventListener("focusin", onFocus, true);
	return () => {
		doc.removeEventListener("keydown", handleKeyDown, true);
		doc.removeEventListener("paste", handlePaste, true);
		doc.removeEventListener("focusout", onBlur, true);
		doc.removeEventListener("focusin", onFocus, true);
	};
}
