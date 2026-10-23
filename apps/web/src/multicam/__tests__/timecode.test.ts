import { describe, expect, test } from "bun:test";
import { formatTimecode, offsetsFromTimecodes, readTimecode } from "../timecode";

// eslint-disable-next-line opencut/prefer-object-params -- byte-building helper
const box = (type: string, ...parts: Uint8Array[]) => {
	const body = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(8 + body);
	new DataView(out.buffer).setUint32(0, 8 + body);
	out.set([...type].map((c) => c.charCodeAt(0)), 4);
	let at = 8;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
};
const u32 = (...v: number[]) => {
	const b = new Uint8Array(v.length * 4);
	v.forEach((x, i) => new DataView(b.buffer).setUint32(i * 4, x));
	return b;
};
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

/** A minimal MP4 with a 25 fps tmcd track whose sample (at the end) holds `frame`. */
function mp4(frame: number): Blob {
	const build = (offset: number) => {
		const hdlr = box("hdlr", u32(0, 0), ascii("tmcd"), u32(0, 0, 0), new Uint8Array([0]));
		const entry = box("tmcd", new Uint8Array(6), new Uint8Array([0, 1]), u32(0, 0, 25, 1), new Uint8Array([25, 0]));
		const stsd = box("stsd", u32(0, 1), entry);
		const stco = box("stco", u32(0, 1, offset));
		const moov = box("moov", box("trak", box("mdia", hdlr, box("minf", box("stbl", stsd, stco)))));
		const ftyp = box("ftyp", ascii("isom"), u32(0));
		return { ftyp, moov };
	};
	const { ftyp, moov } = build(0);
	const offset = ftyp.length + moov.length + 8;
	const real = build(offset);
	return new Blob([real.ftyp, real.moov, box("mdat", u32(frame))]);
}

describe("timecode sync", () => {
	test("reads the start timecode from a tmcd track", async () => {
		// 10:00:05:12 at 25 fps.
		const frame = (10 * 3600 + 5) * 25 + 12;
		const tc = await readTimecode(mp4(frame));
		expect(tc?.label).toBe("10:00:05:12");
		expect(tc?.seconds).toBeCloseTo(36005.48, 5);
	});
	test("no timecode track", async () => {
		expect(await readTimecode(new Blob([box("ftyp", ascii("isom")), box("moov")]))).toBeNull();
	});
	test("offsets, also across midnight", () => {
		expect(offsetsFromTimecodes([100, 102.5, 99])).toEqual([1, 3.5, 0]);
		expect(offsetsFromTimecodes([86399, 1])).toEqual([0, 2]);
		expect(formatTimecode({ frame: 1800, fps: 30, dropFrame: true })).toBe("00:01:00;02");
		expect(formatTimecode({ frame: 17982, fps: 30, dropFrame: true })).toBe("00:10:00;00");
		expect(formatTimecode({ frame: 3661 * 25 + 5, fps: 25 })).toBe("01:01:01:05");
	});
});
