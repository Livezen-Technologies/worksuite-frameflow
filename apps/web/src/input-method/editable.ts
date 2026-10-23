/**
 * Lets the input method type into contentEditable elements such as the
 * text box on the preview (SRS TI-01): the element gets the small part of
 * the textarea interface the controller uses, with offsets counted over
 * its plain text.
 */

export interface TextFieldLike {
	readonly value: string;
	readonly selectionStart: number | null;
	readonly selectionEnd: number | null;
	readonly isConnected: boolean;
	readonly ownerDocument: Document;
	setRangeText(text: string, start: number, end: number, mode: "end"): void;
	dispatchEvent(event: Event): boolean;
	focus(): void;
	getBoundingClientRect(): DOMRect;
}

/** Offset of a DOM point within the element's text. */
function offsetOf({ root, node, offset }: { root: HTMLElement; node: Node; offset: number }): number {
	const range = root.ownerDocument.createRange();
	range.selectNodeContents(root);
	range.setEnd(node, offset);
	return range.toString().length;
}

/** The DOM point at a text offset, entering text nodes. */
function pointAt({ root, offset }: { root: HTMLElement; offset: number }): { node: Node; offset: number } {
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let left = offset;
	let last: Node | null = null;
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const length = n.textContent?.length ?? 0;
		if (left <= length) return { node: n, offset: left };
		left -= length;
		last = n;
	}
	return last
		? { node: last, offset: last.textContent?.length ?? 0 }
		: { node: root, offset: root.childNodes.length };
}

class EditableField implements TextFieldLike {
	constructor(readonly element: HTMLElement) {}

	get value() {
		return this.element.textContent ?? "";
	}
	private selection(): [number, number] | null {
		const sel = this.element.ownerDocument.getSelection();
		if (!sel || sel.rangeCount === 0) return null;
		const range = sel.getRangeAt(0);
		if (!this.element.contains(range.startContainer)) return null;
		return [
			offsetOf({ root: this.element, node: range.startContainer, offset: range.startOffset }),
			offsetOf({ root: this.element, node: range.endContainer, offset: range.endOffset }),
		];
	}
	get selectionStart() {
		return this.selection()?.[0] ?? null;
	}
	get selectionEnd() {
		return this.selection()?.[1] ?? null;
	}
	get isConnected() {
		return this.element.isConnected;
	}
	get ownerDocument() {
		return this.element.ownerDocument;
	}
	// eslint-disable-next-line opencut/prefer-object-params -- mirrors HTMLTextAreaElement.setRangeText.
	setRangeText(text: string, start: number, end: number): void {
		const doc = this.element.ownerDocument;
		const range = doc.createRange();
		const from = pointAt({ root: this.element, offset: start });
		const to = pointAt({ root: this.element, offset: end });
		range.setStart(from.node, from.offset);
		range.setEnd(to.node, to.offset);
		range.deleteContents();
		const node = doc.createTextNode(text);
		range.insertNode(node);
		this.element.normalize();
		const caret = pointAt({ root: this.element, offset: start + text.length });
		const sel = doc.getSelection();
		sel?.removeAllRanges();
		const after = doc.createRange();
		after.setStart(caret.node, caret.offset);
		after.collapse(true);
		sel?.addRange(after);
	}
	dispatchEvent(event: Event) {
		return this.element.dispatchEvent(event);
	}
	focus() {
		this.element.focus();
	}
	getBoundingClientRect() {
		return this.element.getBoundingClientRect();
	}
}

const fields = new WeakMap<HTMLElement, EditableField>();

/** The same wrapper every time, so the controller can compare fields. */
function isEditableElement(target: EventTarget | null): target is HTMLElement {
	// Property checks rather than instanceof: pop-out windows have their own globals.
	return !!target && "isContentEditable" in target && target.isContentEditable === true && "dataset" in target;
}

export function editableField(target: EventTarget | null): TextFieldLike | null {
	if (!isEditableElement(target)) return null;
	const element = target;
	if (element.dataset.noInputMethod !== undefined) return null;
	let field = fields.get(element);
	if (!field) {
		field = new EditableField(element);
		fields.set(element, field);
	}
	return field;
}
