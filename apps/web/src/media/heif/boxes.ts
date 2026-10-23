/**
 * Reads the parts of a HEIF file's `meta` box that libheif's JavaScript
 * binding doesn't hand over: EXIF (SRS HE-09), the colour profile (HE-03)
 * and auxiliary pictures such as depth maps and HDR gain maps (HE-04, HE-07).
 */

export interface HeifItem {
	id: number;
	type: string;
	/** Absolute byte ranges of the item's data. */
	extents: { offset: number; length: number }[];
	/** Properties (from ipco) associated with the item. */
	properties: HeifProperty[];
}

export type HeifProperty =
	| { type: "colr-nclx"; primaries: number; transfer: number; matrix: number; fullRange: boolean }
	| { type: "colr-icc"; icc: Uint8Array }
	| { type: "auxC"; urn: string }
	| { type: string };

export interface HeifMeta {
	primaryId: number;
	items: Map<number, HeifItem>;
	/** from → [{ type, to }] (iref). */
	references: { type: string; from: number; to: number[] }[];
}

interface Box {
	type: string;
	start: number;
	body: number;
	end: number;
}

class Reader {
	readonly view: DataView;
	constructor(readonly bytes: Uint8Array) {
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	}
	fourcc(at: number) {
		return String.fromCharCode(...this.bytes.subarray(at, at + 4));
	}
	uint({ at, size }: { at: number; size: number }): number {
		switch (size) {
			case 0: return 0;
			case 1: return this.view.getUint8(at);
			case 2: return this.view.getUint16(at);
			case 4: return this.view.getUint32(at);
			case 8: return Number(this.view.getBigUint64(at));
			default: throw new Error(`Bad field size ${size}`);
		}
	}
	boxes({ start, end }: { start: number; end: number }): Box[] {
		const out: Box[] = [];
		let at = start;
		while (at + 8 <= end) {
			let size = this.view.getUint32(at);
			const type = this.fourcc(at + 4);
			let body = at + 8;
			if (size === 1) {
				size = Number(this.view.getBigUint64(at + 8));
				body = at + 16;
			} else if (size === 0) size = end - at;
			if (size < 8 || at + size > end) break;
			out.push({ type, start: at, body, end: at + size });
			at += size;
		}
		return out;
	}
	children({ box, skip = 0 }: { box: Box; skip?: number }) {
		return this.boxes({ start: box.body + skip, end: box.end });
	}
}

function parseIinf({ r, iinf }: { r: Reader; iinf: Box }): Map<number, string> {
	const version = r.bytes[iinf.body];
	const countSize = version === 0 ? 2 : 4;
	const types = new Map<number, string>();
	for (const infe of r.children({ box: iinf, skip: 4 + countSize })) {
		if (infe.type !== "infe") continue;
		const v = r.bytes[infe.body];
		if (v < 2) continue;
		const idSize = v === 2 ? 2 : 4;
		const id = r.uint({ at: infe.body + 4, size: idSize });
		types.set(id, r.fourcc(infe.body + 4 + idSize + 2));
	}
	return types;
}

function parseIloc({ r, iloc }: { r: Reader; iloc: Box }) {
	const v = r.bytes[iloc.body];
	let at = iloc.body + 4;
	const sizes = r.view.getUint16(at);
	at += 2;
	const offsetSize = sizes >> 12;
	const lengthSize = (sizes >> 8) & 15;
	const baseSize = (sizes >> 4) & 15;
	const indexSize = v === 1 || v === 2 ? sizes & 15 : 0;
	const count = r.uint({ at, size: v < 2 ? 2 : 4 });
	at += v < 2 ? 2 : 4;
	const out = new Map<number, { method: number; extents: { offset: number; length: number }[] }>();
	for (let i = 0; i < count; i++) {
		const id = r.uint({ at, size: v < 2 ? 2 : 4 });
		at += v < 2 ? 2 : 4;
		let method = 0;
		if (v === 1 || v === 2) {
			method = r.view.getUint16(at) & 15;
			at += 2;
		}
		at += 2; // data_reference_index
		const base = r.uint({ at, size: baseSize });
		at += baseSize;
		const extentCount = r.view.getUint16(at);
		at += 2;
		const extents: { offset: number; length: number }[] = [];
		for (let e = 0; e < extentCount; e++) {
			at += indexSize;
			const offset = r.uint({ at, size: offsetSize });
			at += offsetSize;
			const length = r.uint({ at, size: lengthSize });
			at += lengthSize;
			extents.push({ offset: base + offset, length });
		}
		out.set(id, { method, extents });
	}
	return out;
}

function parseProperty({ r, box }: { r: Reader; box: Box }): HeifProperty {
	if (box.type === "colr") {
		const kind = r.fourcc(box.body);
		if (kind === "nclx")
			return {
				type: "colr-nclx",
				primaries: r.view.getUint16(box.body + 4),
				transfer: r.view.getUint16(box.body + 6),
				matrix: r.view.getUint16(box.body + 8),
				fullRange: (r.bytes[box.body + 10] & 0x80) !== 0,
			};
		if (kind === "prof" || kind === "rICC")
			return { type: "colr-icc", icc: r.bytes.slice(box.body + 4, box.end) };
	}
	if (box.type === "auxC") {
		const raw = r.bytes.subarray(box.body + 4, box.end);
		const nul = raw.indexOf(0);
		return { type: "auxC", urn: new TextDecoder().decode(raw.subarray(0, nul < 0 ? raw.length : nul)) };
	}
	return { type: box.type };
}

function parseIprp({ r, iprp }: { r: Reader; iprp: Box }): Map<number, HeifProperty[]> {
	const kids = r.children({ box: iprp });
	const ipco = kids.find((b) => b.type === "ipco");
	const props = ipco ? r.children({ box: ipco }).map((box) => parseProperty({ r, box })) : [];
	const byItem = new Map<number, HeifProperty[]>();
	for (const ipma of kids.filter((b) => b.type === "ipma")) {
		const v = r.bytes[ipma.body];
		const flags = r.bytes[ipma.body + 3];
		let at = ipma.body + 4;
		const count = r.view.getUint32(at);
		at += 4;
		for (let i = 0; i < count; i++) {
			const id = r.uint({ at, size: v < 1 ? 2 : 4 });
			at += v < 1 ? 2 : 4;
			const n = r.bytes[at++];
			const list = byItem.get(id) ?? [];
			for (let k = 0; k < n; k++) {
				const index = flags & 1 ? r.view.getUint16(at) & 0x7fff : r.bytes[at] & 0x7f;
				at += flags & 1 ? 2 : 1;
				const p = props[index - 1];
				if (p) list.push(p);
			}
			byItem.set(id, list);
		}
	}
	return byItem;
}

function parseIref({ r, iref }: { r: Reader; iref: Box }) {
	const v = r.bytes[iref.body];
	const idSize = v === 0 ? 2 : 4;
	return r.children({ box: iref, skip: 4 }).map((ref) => {
		let at = ref.body;
		const from = r.uint({ at, size: idSize });
		at += idSize;
		const count = r.view.getUint16(at);
		at += 2;
		const to: number[] = [];
		for (let i = 0; i < count; i++, at += idSize) to.push(r.uint({ at, size: idSize }));
		return { type: ref.type, from, to };
	});
}

/** The meta box of a HEIF/AVIF file, or null when there is none. */
export function readHeifMeta(bytes: Uint8Array): HeifMeta | null {
	const r = new Reader(bytes);
	const meta = r.boxes({ start: 0, end: bytes.length }).find((b) => b.type === "meta");
	if (!meta) return null;
	const kids = r.children({ box: meta, skip: 4 });
	const pitm = kids.find((b) => b.type === "pitm");
	const iinf = kids.find((b) => b.type === "iinf");
	const iloc = kids.find((b) => b.type === "iloc");
	const iprp = kids.find((b) => b.type === "iprp");
	const iref = kids.find((b) => b.type === "iref");
	const idat = kids.find((b) => b.type === "idat");
	if (!iinf || !iloc) return null;
	const types = parseIinf({ r, iinf });
	const locations = parseIloc({ r, iloc });
	const props = iprp ? parseIprp({ r, iprp }) : new Map<number, HeifProperty[]>();
	const items = new Map<number, HeifItem>();
	for (const [id, type] of types) {
		const loc = locations.get(id);
		const extents = (loc?.extents ?? []).map((e) =>
			// construction_method 1: offsets into the idat box.
			loc?.method === 1 && idat ? { offset: idat.body + e.offset, length: e.length } : e,
		);
		items.set(id, { id, type, extents, properties: props.get(id) ?? [] });
	}
	const primaryId = pitm ? r.uint({ at: pitm.body + 4, size: r.bytes[pitm.body] === 0 ? 2 : 4 }) : [...items.keys()][0] ?? 0;
	return { primaryId, items, references: iref ? parseIref({ r, iref }) : [] };
}

export function itemData({ bytes, item }: { bytes: Uint8Array; item: HeifItem }): Uint8Array {
	const total = item.extents.reduce((n, e) => n + (e.length || bytes.length - e.offset), 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const e of item.extents) {
		const length = e.length || bytes.length - e.offset;
		out.set(bytes.subarray(e.offset, e.offset + length), at);
		at += length;
	}
	return out;
}

/** The colour primaries of the primary picture (nclx code or "display-p3" from an ICC profile). */
export function primaryColor(meta: HeifMeta): "srgb" | "display-p3" | "bt2020" | "other" {
	const props = meta.items.get(meta.primaryId)?.properties ?? [];
	for (const p of props) {
		if (p.type === "colr-nclx" && "primaries" in p) {
			if (p.primaries === 12) return "display-p3";
			if (p.primaries === 9) return "bt2020";
			if (p.primaries === 1 || p.primaries === 2) return "srgb";
			return "other";
		}
		if (p.type === "colr-icc" && "icc" in p) {
			const text = new TextDecoder("latin1").decode(p.icc);
			const utf16 = new TextDecoder("utf-16be").decode(p.icc);
			if (/Display P3|P3 D65|DCI-P3/i.test(text) || /Display P3|P3 D65/i.test(utf16)) return "display-p3";
			if (/2020/.test(text) || /2020/.test(utf16)) return "bt2020";
			return "srgb";
		}
	}
	return "srgb";
}

/** Auxiliary pictures of the primary: alpha, depth, HDR gain map… */
export function auxiliaryItems(meta: HeifMeta): { id: number; urn: string }[] {
	return meta.references
		.filter((ref) => ref.type === "auxl" && ref.to.includes(meta.primaryId))
		.map((ref) => {
			const urn = meta.items.get(ref.from)?.properties.find((p): p is { type: "auxC"; urn: string } => p.type === "auxC")?.urn ?? "";
			return { id: ref.from, urn };
		});
}
