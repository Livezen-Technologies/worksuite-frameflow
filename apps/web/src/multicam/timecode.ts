/**
 * Embedded timecode from MP4/MOV files (SC-25): the 'tmcd' track that
 * cameras and recorders write. Only the boxes needed are read, so long
 * files aren't loaded into memory.
 */

type Box = { type: string; start: number; size: number; header: number };

function boxesIn({ view, from, to }: { view: DataView; from: number; to: number }): Box[] {
	const out: Box[] = [];
	let at = from;
	while (at + 8 <= to) {
		let size = view.getUint32(at);
		const type = String.fromCharCode(
			view.getUint8(at + 4),
			view.getUint8(at + 5),
			view.getUint8(at + 6),
			view.getUint8(at + 7),
		);
		let header = 8;
		if (size === 1) {
			size = Number(view.getBigUint64(at + 8));
			header = 16;
		} else if (size === 0) size = to - at;
		if (size < header) break;
		out.push({ type, start: at, size, header });
		at += size;
	}
	return out;
}

const child = ({ view, box, type }: { view: DataView; box: Box; type: string }) =>
	boxesIn({ view, from: box.start + box.header, to: box.start + box.size }).find((b) => b.type === type);

/** Where the timecode sample is and how to read it, from a 'moov' box's bytes. */
export function findTimecodeTrack(moov: DataView): {
	offset: number;
	timescale: number;
	frameDuration: number;
	fps: number;
	dropFrame: boolean;
} | null {
	for (const trak of boxesIn({ view: moov, from: 8, to: moov.byteLength }).filter((b) => b.type === "trak")) {
		const mdia = child({ view: moov, box: trak, type: "mdia" });
		const hdlr = mdia && child({ view: moov, box: mdia, type: "hdlr" });
		if (!mdia || !hdlr) continue;
		const handler = String.fromCharCode(...[16, 17, 18, 19].map((i) => moov.getUint8(hdlr.start + i)));
		if (handler !== "tmcd") continue;
		const minf = child({ view: moov, box: mdia, type: "minf" });
		const stbl = minf && child({ view: moov, box: minf, type: "stbl" });
		const stsd = stbl && child({ view: moov, box: stbl, type: "stsd" });
		if (!stbl || !stsd) continue;
		// stsd: version/flags(4), count(4), then the first sample entry.
		const entry = stsd.start + stsd.header + 8;
		if (String.fromCharCode(...[4, 5, 6, 7].map((i) => moov.getUint8(entry + i))) !== "tmcd") continue;
		const body = entry + 16; // size, type, 6 reserved, data ref index
		const flags = moov.getUint32(body + 4);
		const timescale = moov.getUint32(body + 8);
		const frameDuration = moov.getUint32(body + 12);
		const fps = moov.getUint8(body + 16);
		const stco = child({ view: moov, box: stbl, type: "stco" });
		const co64 = child({ view: moov, box: stbl, type: "co64" });
		const offset = stco
			? moov.getUint32(stco.start + stco.header + 8)
			: co64
				? Number(moov.getBigUint64(co64.start + co64.header + 8))
				: null;
		if (offset === null || !timescale || !frameDuration) continue;
		return { offset, timescale, frameDuration, fps, dropFrame: (flags & 1) === 1 };
	}
	return null;
}

/** Seconds since midnight from the frame number stored in the timecode sample. */
export function timecodeSeconds({
	frame,
	timescale,
	frameDuration,
}: {
	frame: number;
	timescale: number;
	frameDuration: number;
}): number {
	return (frame * frameDuration) / timescale;
}

/** HH:MM:SS:FF from a frame count; drop-frame skips labels 0 and 1 each minute except every tenth (';' before frames). */
export function formatTimecode({ frame, fps, dropFrame = false }: { frame: number; fps: number; dropFrame?: boolean }): string {
	let n = frame;
	if (dropFrame && fps > 0) {
		const drop = Math.round(fps / 15);
		const perMinute = fps * 60 - drop;
		const perTen = perMinute * 10 + drop;
		const tens = Math.floor(n / perTen);
		const rest = n % perTen;
		n += drop * 9 * tens + (rest > drop ? drop * Math.floor((rest - drop) / perMinute) : 0);
	}
	const ff = n % fps;
	const total = Math.floor(n / fps);
	const pad = (v: number) => String(v).padStart(2, "0");
	return `${pad(Math.floor(total / 3600) % 24)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}${dropFrame ? ";" : ":"}${pad(ff)}`;
}

async function bytes({ file, start, length }: { file: Blob; start: number; length: number }): Promise<DataView> {
	return new DataView(await file.slice(start, start + length).arrayBuffer());
}

/** The file's starting timecode in seconds since midnight, or null when it has none. */
export async function readTimecode(file: Blob): Promise<{ seconds: number; label: string } | null> {
	let at = 0;
	while (at + 8 <= file.size) {
		const head = await bytes({ file, start: at, length: 16 });
		let size = head.getUint32(0);
		const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
		if (size === 1) size = Number(head.getBigUint64(8));
		else if (size === 0) size = file.size - at;
		if (size < 8) return null;
		if (type === "moov") {
			if (size > 64 * 1024 * 1024) return null;
			const track = findTimecodeTrack(await bytes({ file, start: at, length: size }));
			if (!track) return null;
			const frame = (await bytes({ file, start: track.offset, length: 4 })).getUint32(0);
			const seconds = timecodeSeconds({ frame, ...track });
			return { seconds, label: formatTimecode({ frame, fps: track.fps, dropFrame: track.dropFrame }) };
		}
		at += size;
	}
	return null;
}

/** Offsets from each angle's start timecode; recordings across midnight count as the next day. */
export function offsetsFromTimecodes(starts: number[]): number[] {
	const first = Math.min(...starts);
	const day = 24 * 3600;
	const fixed = starts.map((s) => (s - first > day / 2 ? s - day : s));
	const min = Math.min(...fixed);
	return fixed.map((s) => s - min);
}
