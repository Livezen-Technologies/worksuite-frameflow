/* eslint-disable opencut/prefer-object-params -- byte-level EBML helpers (view, offset) read better positionally */
/**
 * Adds HDR10 static metadata (MaxCLL, MaxFALL and the mastering display)
 * to a WebM's Colour element (SRS HD-14). Tracks is rebuilt with the new
 * children; SeekHead and Cues are rebuilt with every position mapped to
 * the new layout. Anything unexpected returns the file unchanged.
 */

const ID = {
	segment: 0x18538067,
	seekHead: 0x114d9b74,
	seek: 0x4dbb,
	seekPosition: 0x53ac,
	tracks: 0x1654ae6b,
	trackEntry: 0xae,
	video: 0xe0,
	colour: 0x55b0,
	maxCll: 0x55bc,
	maxFall: 0x55bd,
	mastering: 0x55d0,
	cues: 0x1c53bb6b,
	cuePoint: 0xbb,
	cueTrackPositions: 0xb7,
	cueClusterPosition: 0xf1,
} as const;

const MASTERS = new Set<number>([
	ID.tracks,
	ID.trackEntry,
	ID.video,
	ID.colour,
	ID.seekHead,
	ID.seek,
	ID.cues,
	ID.cuePoint,
	ID.cueTrackPositions,
]);

interface Node {
	id: number;
	/** Byte offset of the element's data. */
	data: number;
	size: number;
	/** Byte offset of the element itself. */
	start: number;
	end: number;
	children?: Node[];
}

function readId(view: Uint8Array, at: number): { id: number; length: number } {
	const first = view[at];
	const length =
		first >= 0x80
			? 1
			: first >= 0x40
				? 2
				: first >= 0x20
					? 3
					: first >= 0x10
						? 4
						: 0;
	if (!length) throw new Error("bad id");
	let id = 0;
	for (let i = 0; i < length; i++) id = id * 256 + view[at + i];
	return { id, length };
}

function readSize(
	view: Uint8Array,
	at: number,
): { size: number; length: number; unknown: boolean } {
	const first = view[at];
	let length = 1;
	while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
	if (length > 8) throw new Error("bad size");
	let size = first & (0xff >> length);
	let allOnes = size === 0xff >> length;
	for (let i = 1; i < length; i++) {
		size = size * 256 + view[at + i];
		if (view[at + i] !== 0xff) allOnes = false;
	}
	return { size, length, unknown: allOnes };
}

function parse(view: Uint8Array, from: number, to: number): Node[] {
	const nodes: Node[] = [];
	// A cut-off buffer (just the start of a file) ends the list early.
	const limit = Math.min(to, view.length);
	let at = from;
	while (at < limit && at + 2 <= view.length) {
		const id = readId(view, at);
		const size = readSize(view, at + id.length);
		const data = at + id.length + size.length;
		const end = size.unknown ? to : data + size.size;
		const node: Node = { id: id.id, data, size: end - data, start: at, end };
		if (MASTERS.has(id.id)) node.children = parse(view, data, end);
		nodes.push(node);
		at = end;
	}
	return nodes;
}

function encodeId(id: number): number[] {
	const bytes: number[] = [];
	for (let v = id; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
	return bytes;
}

function encodeSize(size: number): number[] {
	let length = 1;
	while (size >= 2 ** (7 * length) - 1) length++;
	const bytes: number[] = [];
	let v = size;
	for (let i = 0; i < length; i++) {
		bytes.unshift(v % 256);
		v = Math.floor(v / 256);
	}
	bytes[0] |= 0x80 >> (length - 1);
	return bytes;
}

function element(id: number, body: Uint8Array | number[]): Uint8Array {
	const head = [...encodeId(id), ...encodeSize(body.length)];
	const out = new Uint8Array(head.length + body.length);
	out.set(head);
	out.set(body, head.length);
	return out;
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

function uint(value: number): number[] {
	const bytes: number[] = [];
	for (
		let v = Math.max(0, Math.round(value));
		bytes.length === 0 || v > 0;
		v = Math.floor(v / 256)
	)
		bytes.unshift(v & 0xff);
	return bytes;
}

function readUint(view: Uint8Array, node: Node): number {
	let v = 0;
	for (let i = 0; i < node.size; i++) v = v * 256 + view[node.data + i];
	return v;
}

function float(value: number): number[] {
	const b = new Uint8Array(4);
	new DataView(b.buffer).setFloat32(0, value);
	return [...b];
}

export interface HdrStaticMetadata {
	maxCll: number;
	maxFall: number;
	/** Mastering display luminance in nits (BT.2020 primaries, D65). */
	maxLuminance: number;
	minLuminance: number;
}

function hdrChildren(meta: HdrStaticMetadata): Uint8Array[] {
	// BT.2020 primaries and D65 white (CIE 1931 xy).
	const chroma: [number, number][] = [
		[0x55d1, 0.708],
		[0x55d2, 0.292],
		[0x55d3, 0.17],
		[0x55d4, 0.797],
		[0x55d5, 0.131],
		[0x55d6, 0.046],
		[0x55d7, 0.3127],
		[0x55d8, 0.329],
		[0x55d9, meta.maxLuminance],
		[0x55da, meta.minLuminance],
	];
	return [
		element(ID.maxCll, uint(meta.maxCll)),
		element(ID.maxFall, uint(meta.maxFall)),
		element(
			ID.mastering,
			concat(chroma.map(([id, v]) => element(id, float(v)))),
		),
	];
}

/** Re-serialise a master element, adding HDR metadata to Colour. */
function rebuildTracks(
	view: Uint8Array,
	node: Node,
	meta: HdrStaticMetadata,
	state: { touched: boolean },
): Uint8Array {
	if (!node.children) return view.subarray(node.start, node.end);
	const keep = (n: Node) =>
		!(
			node.id === ID.colour &&
			(n.id === ID.maxCll || n.id === ID.maxFall || n.id === ID.mastering)
		);
	const parts = node.children
		.filter(keep)
		.map((c) => rebuildTracks(view, c, meta, state));
	if (node.id === ID.colour) {
		parts.push(...hdrChildren(meta));
		state.touched = true;
	}
	return element(node.id, concat(parts));
}

/** Re-serialise SeekHead / Cues with every position mapped to the new layout. */
function remap(
	view: Uint8Array,
	node: Node,
	leaf: number,
	map: (old: number) => number,
): Uint8Array {
	if (node.id === leaf)
		return element(node.id, uint(map(readUint(view, node))));
	if (!node.children) return view.subarray(node.start, node.end);
	return element(
		node.id,
		concat(node.children.map((c) => remap(view, c, leaf, map))),
	);
}

const same = (a: Uint8Array, b: Uint8Array) =>
	a.length === b.length && a.every((v, i) => v === b[i]);

export function injectHdrMetadata({
	buffer,
	meta,
}: {
	buffer: ArrayBuffer;
	meta: HdrStaticMetadata;
}): {
	buffer: ArrayBuffer;
	injected: boolean;
} {
	try {
		const view = new Uint8Array(buffer);
		const segment = parse(view, 0, view.length).find(
			(n) => n.id === ID.segment,
		);
		if (!segment) return { buffer, injected: false };
		const children = parse(view, segment.data, segment.end);
		const tracks = children.find((n) => n.id === ID.tracks);
		if (!tracks?.children) return { buffer, injected: false };
		const state = { touched: false };
		const parts = children.map((c) =>
			c === tracks
				? rebuildTracks(view, tracks, meta, state)
				: view.subarray(c.start, c.end),
		);
		if (!state.touched) return { buffer, injected: false };
		// Positions in SeekHead and Cues are relative to the segment's data and
		// point at level-1 elements; rebuild both until the layout settles.
		const oldStarts = children.map((c) => c.start - segment.data);
		for (let pass = 0; pass < 6; pass++) {
			const newStarts: number[] = [];
			let at = 0;
			for (const p of parts) {
				newStarts.push(at);
				at += p.length;
			}
			const map = (old: number) => {
				const index = oldStarts.indexOf(old);
				if (index < 0) throw new Error("position isn't at an element");
				return newStarts[index];
			};
			let changed = false;
			children.forEach((c, i) => {
				const leaf =
					c.id === ID.seekHead
						? ID.seekPosition
						: c.id === ID.cues
							? ID.cueClusterPosition
							: null;
				if (leaf === null) return;
				const next = remap(view, c, leaf, map);
				if (!same(next, parts[i])) {
					parts[i] = next;
					changed = true;
				}
			});
			if (!changed) break;
			if (pass === 5) return { buffer, injected: false };
		}
		const body = concat(parts);
		const out = concat([
			view.subarray(0, segment.start),
			new Uint8Array([...encodeId(ID.segment), ...encodeSize(body.length)]),
			body,
		]);
		return { buffer: out.buffer, injected: true };
	} catch {
		return { buffer, injected: false };
	}
}

/** Read back MaxCLL / MaxFALL (import, HD-01, and tests). */
export function readHdrMetadata({ buffer }: { buffer: ArrayBuffer }): {
	maxCll?: number;
	maxFall?: number;
} {
	try {
		const view = new Uint8Array(buffer);
		const segment = parse(view, 0, view.length).find(
			(n) => n.id === ID.segment,
		);
		if (!segment) return {};
		const tracks = parse(view, segment.data, segment.end).find(
			(n) => n.id === ID.tracks,
		);
		const out: { maxCll?: number; maxFall?: number } = {};
		const walk = (nodes: Node[] = []) => {
			for (const n of nodes) {
				if (n.id === ID.maxCll) out.maxCll = readUint(view, n);
				if (n.id === ID.maxFall) out.maxFall = readUint(view, n);
				walk(n.children);
			}
		};
		walk(tracks?.children);
		return out;
	} catch {
		return {};
	}
}
