/**
 * Where the caret is on screen, so suggestions open right under the word
 * being typed. Inputs and text areas are measured with a hidden copy of the
 * field; other editable elements use the selection's rectangle.
 */
const COPIED = [
	"boxSizing", "width", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
	"paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontFamily", "fontSize", "fontWeight",
	"fontStyle", "letterSpacing", "lineHeight", "textTransform", "wordSpacing", "tabSize", "whiteSpace",
	"wordWrap", "overflowWrap", "textIndent",
] as const;

export function caretRect(field: {
	getBoundingClientRect(): DOMRect;
	ownerDocument: Document;
	selectionStart: number | null;
	value: string;
}): { left: number; top: number; bottom: number } {
	const box = field.getBoundingClientRect();
	const fallback = { left: box.left, top: box.top, bottom: box.bottom };
	const doc = field.ownerDocument;
	const view = doc.defaultView;
	if (!view) return fallback;

	if (field instanceof view.HTMLInputElement || field instanceof view.HTMLTextAreaElement) {
		const style = view.getComputedStyle(field);
		const mirror = doc.createElement("div");
		for (const key of COPIED) mirror.style[key] = style[key];
		mirror.style.position = "absolute";
		mirror.style.visibility = "hidden";
		mirror.style.top = "0";
		mirror.style.left = "-9999px";
		mirror.style.overflow = "hidden";
		if (field instanceof view.HTMLTextAreaElement) {
			mirror.style.whiteSpace = "pre-wrap";
			mirror.style.overflowWrap = "break-word";
		} else mirror.style.whiteSpace = "pre";
		const at = field.selectionStart ?? field.value.length;
		mirror.textContent = field.value.slice(0, at);
		const marker = doc.createElement("span");
		marker.textContent = field.value.slice(at) || ".";
		mirror.appendChild(marker);
		doc.body.appendChild(mirror);
		const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.3;
		const left = box.left + marker.offsetLeft - field.scrollLeft;
		const top = box.top + marker.offsetTop - field.scrollTop;
		mirror.remove();
		return {
			left: Math.min(Math.max(left, box.left), box.right),
			top: Math.max(top, box.top),
			bottom: Math.min(top + lineHeight, box.bottom),
		};
	}

	const selection = doc.getSelection();
	if (selection && selection.rangeCount > 0) {
		const rect = selection.getRangeAt(0).getBoundingClientRect();
		if (rect.width || rect.height) return { left: rect.left, top: rect.top, bottom: rect.bottom };
	}
	return fallback;
}
