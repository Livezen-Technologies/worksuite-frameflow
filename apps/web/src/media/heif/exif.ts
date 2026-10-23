import { itemData, readHeifMeta } from "./boxes";

/** What a photo says about itself (SRS HE-09). */
export interface PhotoInfo {
	/** As written by the camera, e.g. "2024:05:01 14:03:22", with its offset if given. */
	takenAt?: string;
	make?: string;
	model?: string;
	latitude?: number;
	longitude?: number;
	altitude?: number;
}

const TAGS = {
	make: 0x010f,
	model: 0x0110,
	exifIfd: 0x8769,
	gpsIfd: 0x8825,
	dateTimeOriginal: 0x9003,
	offsetTimeOriginal: 0x9011,
};

interface Entry {
	tag: number;
	type: number;
	count: number;
	/** Where the value is (inline or at the offset). */
	at: number;
}

/** Reads a TIFF-structured EXIF block (starting at the byte order mark). */
export function parseTiff(tiff: Uint8Array): PhotoInfo {
	if (tiff.length < 8) return {};
	const little = tiff[0] === 0x49;
	const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
	const u16 = (at: number) => view.getUint16(at, little);
	const u32 = (at: number) => view.getUint32(at, little);
	const SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
	const ifd = (offset: number): Entry[] => {
		if (offset <= 0 || offset + 2 > tiff.length) return [];
		const n = u16(offset);
		const out: Entry[] = [];
		for (let i = 0; i < n; i++) {
			const at = offset + 2 + i * 12;
			if (at + 12 > tiff.length) break;
			const type = u16(at + 2);
			const count = u32(at + 4);
			const bytes = (SIZES[type] ?? 1) * count;
			out.push({ tag: u16(at), type, count, at: bytes <= 4 ? at + 8 : u32(at + 8) });
		}
		return out;
	};
	const ascii = (e?: Entry) =>
		e && e.at + e.count <= tiff.length
			? new TextDecoder().decode(tiff.subarray(e.at, e.at + e.count)).replace(/\0[\s\S]*$/, "").trim() || undefined
			: undefined;
	const rationals = (e?: Entry) =>
		e && e.type === 5
			? Array.from({ length: e.count }, (_, i) => u32(e.at + i * 8) / (u32(e.at + i * 8 + 4) || 1))
			: [];
	const find = ({ list, tag }: { list: Entry[]; tag: number }) => list.find((e) => e.tag === tag);

	const ifd0 = ifd(u32(4));
	const info: PhotoInfo = {
		make: ascii(find({ list: ifd0, tag: TAGS.make })),
		model: ascii(find({ list: ifd0, tag: TAGS.model })),
	};
	const exifPointer = find({ list: ifd0, tag: TAGS.exifIfd });
	if (exifPointer) {
		const exif = ifd(u32(exifPointer.at));
		const date = ascii(find({ list: exif, tag: TAGS.dateTimeOriginal }));
		const offset = ascii(find({ list: exif, tag: TAGS.offsetTimeOriginal }));
		if (date) info.takenAt = offset ? `${date} ${offset}` : date;
	}
	const gpsPointer = find({ list: ifd0, tag: TAGS.gpsIfd });
	if (gpsPointer) {
		const gps = ifd(u32(gpsPointer.at));
		const dms = (values: number[]) =>
			values.length >= 3 ? values[0] + values[1] / 60 + values[2] / 3600 : undefined;
		const lat = dms(rationals(find({ list: gps, tag: 2 })));
		const lon = dms(rationals(find({ list: gps, tag: 4 })));
		if (lat !== undefined && lon !== undefined) {
			info.latitude = ascii(find({ list: gps, tag: 1 })) === "S" ? -lat : lat;
			info.longitude = ascii(find({ list: gps, tag: 3 })) === "W" ? -lon : lon;
		}
		const alt = rationals(find({ list: gps, tag: 6 }))[0];
		if (alt !== undefined) {
			const below = find({ list: gps, tag: 5 });
			info.altitude = below && tiff[below.at] === 1 ? -alt : alt;
		}
	}
	return Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined));
}

/** EXIF of a HEIC/HEIF photo, or null when it has none. */
export function readHeifExif(bytes: Uint8Array): PhotoInfo | null {
	const meta = readHeifMeta(bytes);
	if (!meta) return null;
	const exifItem = [...meta.items.values()].find((i) => i.type === "Exif");
	if (!exifItem) return null;
	const data = itemData({ bytes, item: exifItem });
	if (data.length < 4) return null;
	// The block starts with the offset to the TIFF header (usually after "Exif\0\0").
	const skip = new DataView(data.buffer, data.byteOffset).getUint32(0);
	const tiff = data.subarray(4 + skip);
	const info = parseTiff(tiff);
	return Object.keys(info).length ? info : null;
}
