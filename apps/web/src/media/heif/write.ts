/**
 * Writes a still as HEIC (SRS HE-10). The desktop app's FFmpeg encodes the
 * frame as a one-frame HEVC MP4; this repackages its decoder configuration
 * (hvcC) and coded picture as a HEIF image item, which FFmpeg can't mux.
 */

interface Box {
	type: string;
	start: number;
	body: number;
	end: number;
}

function boxes({ bytes, start, end }: { bytes: Uint8Array; start: number; end: number }): Box[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const out: Box[] = [];
	let at = start;
	while (at + 8 <= end) {
		let size = view.getUint32(at);
		let body = at + 8;
		if (size === 1) {
			size = Number(view.getBigUint64(at + 8));
			body = at + 16;
		} else if (size === 0) size = end - at;
		if (size < 8 || at + size > end) break;
		out.push({ type: String.fromCharCode(...bytes.subarray(at + 4, at + 8)), start: at, body, end: at + size });
		at += size;
	}
	return out;
}

function find({ bytes, path }: { bytes: Uint8Array; path: string[] }): Box | null {
	let start = 0;
	let end = bytes.length;
	let found: Box | null = null;
	for (const type of path) {
		found = boxes({ bytes, start, end }).find((b) => b.type === type) ?? null;
		if (!found) return null;
		start = found.body;
		end = found.end;
	}
	return found;
}

export interface HevcStill {
	/** The hvcC box, whole. */
	hvcC: Uint8Array;
	/** The coded picture as length-prefixed NAL units. */
	data: Uint8Array;
	width: number;
	height: number;
}

/** The first HEVC frame of an MP4 written by FFmpeg. */
export function hevcStillFromMp4(mp4: Uint8Array): HevcStill {
	const stbl = find({ bytes: mp4, path: ["moov", "trak", "mdia", "minf", "stbl"] });
	if (!stbl) throw new Error("No video track in the encoded frame.");
	const view = new DataView(mp4.buffer, mp4.byteOffset, mp4.byteLength);
	const stsd = boxes({ bytes: mp4, start: stbl.body, end: stbl.end }).find((b) => b.type === "stsd");
	const entry = stsd && boxes({ bytes: mp4, start: stsd.body + 8, end: stsd.end })[0];
	if (!entry || (entry.type !== "hvc1" && entry.type !== "hev1"))
		throw new Error("The encoded frame isn't HEVC.");
	const width = view.getUint16(entry.body + 24);
	const height = view.getUint16(entry.body + 26);
	const hvcC = boxes({ bytes: mp4, start: entry.body + 78, end: entry.end }).find((b) => b.type === "hvcC");
	if (!hvcC) throw new Error("The encoded frame has no HEVC configuration.");
	const kids = boxes({ bytes: mp4, start: stbl.body, end: stbl.end });
	const stsz = kids.find((b) => b.type === "stsz");
	const stco = kids.find((b) => b.type === "stco");
	const co64 = kids.find((b) => b.type === "co64");
	if (!stsz || (!stco && !co64)) throw new Error("The encoded frame has no sample table.");
	const size = view.getUint32(stsz.body + 4) || view.getUint32(stsz.body + 12);
	const offset = stco
		? view.getUint32(stco.body + 8)
		: co64
			? Number(view.getBigUint64(co64.body + 8))
			: 0;
	return {
		hvcC: mp4.slice(hvcC.start, hvcC.end),
		data: mp4.slice(offset, offset + size),
		width,
		height,
	};
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function box({ type, parts }: { type: string; parts: Uint8Array[] }): Uint8Array {
	const size = 8 + parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(size);
	new DataView(out.buffer).setUint32(0, size);
	out.set(ascii(type), 4);
	let at = 8;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

const fullBox = ({ type, version = 0, parts }: { type: string; version?: number; parts: Uint8Array[] }) =>
	box({ type, parts: [Uint8Array.of(version, 0, 0, 0), ...parts] });

function u16(v: number) {
	const out = new Uint8Array(2);
	new DataView(out.buffer).setUint16(0, v);
	return out;
}

function u32(v: number) {
	const out = new Uint8Array(4);
	new DataView(out.buffer).setUint32(0, v);
	return out;
}

/**
 * A single-image HEIC file (item 1, sRGB/BT.709 tagged). `crop` trims an
 * encode padded to the encoder's block size back to the real picture.
 */
export function writeHeic({
	still,
	crop,
}: {
	still: HevcStill;
	crop?: { width: number; height: number };
}): Uint8Array {
	const ftyp = box({ type: "ftyp", parts: [ascii("heic"), u32(0), ascii("mif1"), ascii("heic")] });
	const hdlr = fullBox({ type: "hdlr", parts: [u32(0), ascii("pict"), new Uint8Array(12), Uint8Array.of(0)] });
	const pitm = fullBox({ type: "pitm", parts: [u16(1)] });
	const infe = fullBox({ type: "infe", version: 2, parts: [u16(1), u16(0), ascii("hvc1"), Uint8Array.of(0)] });
	const iinf = fullBox({ type: "iinf", parts: [u16(1), infe] });
	const ispe = fullBox({ type: "ispe", parts: [u32(still.width), u32(still.height)] });
	// nclx: BT.709 primaries, sRGB transfer, BT.601 matrix as FFmpeg encodes, limited range.
	const colr = box({ type: "colr", parts: [ascii("nclx"), u16(1), u16(13), u16(6), Uint8Array.of(0)] });
	const cropped = crop && (crop.width !== still.width || crop.height !== still.height);
	// Clean aperture: the crop size, and its centre's offset from the coded centre.
	const clap = cropped
		? box({
				type: "clap",
				parts: [
					u32(crop.width), u32(1),
					u32(crop.height), u32(1),
					u32((crop.width - still.width) >>> 0), u32(2),
					u32((crop.height - still.height) >>> 0), u32(2),
				],
			})
		: null;
	const ipco = box({ type: "ipco", parts: [still.hvcC, ispe, colr, ...(clap ? [clap] : [])] });
	// Item 1 → properties 1 (hvcC, essential), 2 (ispe), 3 (colr), 4 (clap, essential).
	const assoc = clap ? Uint8Array.of(4, 0x81, 0x02, 0x03, 0x84) : Uint8Array.of(3, 0x81, 0x02, 0x03);
	const ipma = fullBox({ type: "ipma", parts: [u32(1), u16(1), assoc] });
	const iprp = box({ type: "iprp", parts: [ipco, ipma] });
	const ilocFor = (offset: number) =>
		fullBox({
			type: "iloc",
			// offset_size 4, length_size 4, base_offset_size 0; one item, one extent.
			parts: [Uint8Array.of(0x44, 0x00), u16(1), u16(1), u16(0), u16(1), u32(offset), u32(still.data.length)],
		});
	const metaWith = (offset: number) =>
		fullBox({ type: "meta", parts: [hdlr, pitm, iinf, ilocFor(offset), iprp] });
	const metaSize = metaWith(0).length;
	const dataOffset = ftyp.length + metaSize + 8;
	const meta = metaWith(dataOffset);
	const mdat = box({ type: "mdat", parts: [still.data] });
	const out = new Uint8Array(ftyp.length + meta.length + mdat.length);
	out.set(ftyp, 0);
	out.set(meta, ftyp.length);
	out.set(mdat, ftyp.length + meta.length);
	return out;
}
