"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { suggest } from "./candidates";
import { legacyToUnicode, looksLikeLegacy } from "./legacy";
import { useInputMethod } from "./store";

/**
 * The in-app input method (SRS TI-01 – TI-06, TI-09, TI-20). Listens to
 * keys on every text field of a document, keeps the Latin typed for the
 * current word, and replaces the word in the field with its Sinhala or
 * Tamil spelling as each key lands, so no OS keyboard is needed.
 */

type Field = HTMLInputElement | HTMLTextAreaElement;

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
	anchor: { left: number; top: number } | null;
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
let literal = false;
let lastField: Field | null = null;

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

export function isTextField(target: EventTarget | null): target is Field {
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

function clearCandidates() {
	useCandidates.setState({ candidates: [], selected: 0, latin: "", anchor: null });
}

function showCandidates({ comp }: { comp: Composition }) {
	const { mode, sinhalaLayout, suggestions, learned, keepEnglish } =
		useInputMethod.getState();
	if (!suggestions || mode === "en" || (mode === "si" && sinhalaLayout === "wijesekara")) {
		clearCandidates();
		return;
	}
	let candidates = suggest({ latin: comp.keys, language: mode, learned });
	const english = keepEnglish.some((w) => w.toLowerCase() === comp.keys.toLowerCase());
	candidates = english
		? [comp.keys, ...candidates.slice(0, 4)]
		: [...candidates.slice(0, 5), comp.keys];
	const rect = comp.field.getBoundingClientRect();
	useCandidates.setState({
		candidates,
		selected: 0,
		latin: comp.keys,
		anchor: { left: rect.left, top: rect.bottom + 4 },
		doc: comp.field.ownerDocument,
	});
}

function render({ comp }: { comp: Composition }): string {
	const { mode, sinhalaLayout } = useInputMethod.getState();
	if (mode === "si" && sinhalaLayout === "wijesekara")
		return legacyToUnicode({ text: comp.keys });
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
	clearCandidates();
}

export function pickCandidate({ index }: { index: number }) {
	const word = useCandidates.getState().candidates[index];
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
	const field = event.target;
	if (!isTextField(field) || store.mode === "en" || event.isComposing) return;
	if (event.ctrlKey || event.metaKey || event.altKey) {
		commit();
		return;
	}
	if (composition && !stillComposing({ field })) {
		composition = null;
		clearCandidates();
	}
	const key = event.key;
	const { candidates, selected } = useCandidates.getState();
	const wijesekara = store.mode === "si" && store.sinhalaLayout === "wijesekara";

	if (key === "`" && !wijesekara) {
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
		commit(event.shiftKey ? { word: composition.keys } : {});
		insert({ field, text: " " });
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
	const field = event.target;
	if (!isTextField(field)) return;
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
		if (isTextField(event.target)) lastField = event.target;
	};
	const onBlur = (event: FocusEvent) => {
		if (composition && event.target === composition.field) commit();
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
