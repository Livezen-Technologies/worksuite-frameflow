/**
 * Reads the motion data GoPro cameras (MAX, HERO) store in a GPMF metadata
 * track (SRS VR-04, VR-12): camera orientation (CORI), gravity (GRAV), or
 * raw gyro + accelerometer (GYRO/ACCL) when those are all there is.
 */
import { readBoxes, type Box } from "./inject";

export type Vec3 = [number, number, number];
/** w, x, y, z */
export type Quat = [number, number, number, number];

export interface MotionSamples {
	/** Seconds from the start of the file. */
	times: number[];
	orientations?: Quat[];
	gravity?: Vec3[];
	gyro?: { times: number[]; values: Vec3[] };
	accel?: { times: number[]; values: Vec3[] };
}

interface Sample {
	offset: number;
	size: number;
	time: number;
	duration: number;
}

const dv = (bytes: Uint8Array) =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const fourcc = ({ bytes, at }: { bytes: Uint8Array; at: number }) =>
	String.fromCharCode(...bytes.subarray(at, at + 4));

function child({
	bytes,
	parent,
	type,
}: {
	bytes: Uint8Array;
	parent: Box;
	type: string;
}): Box | undefined {
	return readBoxes({
		bytes,
		start: parent.start + parent.headerSize,
		end: parent.start + parent.size,
	}).find((b) => b.type === type);
}

function path({
	bytes,
	from,
	types,
}: {
	bytes: Uint8Array;
	from: Box;
	types: string[];
}): Box | undefined {
	let at: Box | undefined = from;
	for (const type of types) {
		if (!at) return undefined;
		at = child({ bytes, parent: at, type });
	}
	return at;
}

/** Sample offsets and times of the GPMF ('gpmd') track in a moov box. */
export function gpmfSamples(moov: Uint8Array): Sample[] {
	const view = dv(moov);
	for (const trak of readBoxes({ bytes: moov, start: 8, end: moov.length })) {
		if (trak.type !== "trak") continue;
		const stbl = path({ bytes: moov, from: trak, types: ["mdia", "minf", "stbl"] });
		const stsd = stbl && child({ bytes: moov, parent: stbl, type: "stsd" });
		if (!stbl || !stsd) continue;
		if (fourcc({ bytes: moov, at: stsd.start + stsd.headerSize + 12 }) !== "gpmd") continue;
		const mdhd = path({ bytes: moov, from: trak, types: ["mdia", "mdhd"] });
		if (!mdhd) continue;
		const mdhdBody = mdhd.start + mdhd.headerSize;
		const timescale = view.getUint32(mdhdBody + (moov[mdhdBody] === 1 ? 20 : 12));

		const table = (type: string) => {
			const b = child({ bytes: moov, parent: stbl, type });
			return b ? b.start + b.headerSize : -1;
		};
		const stts = table("stts");
		const stsz = table("stsz");
		const stsc = table("stsc");
		const stco = table("stco");
		const co64 = table("co64");
		if (stts < 0 || stsz < 0 || stsc < 0 || (stco < 0 && co64 < 0)) continue;

		const count = view.getUint32(stsz + 8);
		const fixed = view.getUint32(stsz + 4);
		const sizes = Array.from({ length: count }, (_, i) =>
			fixed || view.getUint32(stsz + 12 + i * 4),
		);
		const durations: number[] = [];
		for (let e = 0, n = view.getUint32(stts + 4); e < n; e++) {
			const runs = view.getUint32(stts + 8 + e * 8);
			const delta = view.getUint32(stts + 12 + e * 8);
			for (let i = 0; i < runs; i++) durations.push(delta);
		}
		const chunks =
			stco >= 0
				? Array.from({ length: view.getUint32(stco + 4) }, (_, i) =>
						view.getUint32(stco + 8 + i * 4),
					)
				: Array.from({ length: view.getUint32(co64 + 4) }, (_, i) =>
						Number(view.getBigUint64(co64 + 8 + i * 8)),
					);
		const runs = Array.from({ length: view.getUint32(stsc + 4) }, (_, i) => ({
			first: view.getUint32(stsc + 8 + i * 12) - 1,
			perChunk: view.getUint32(stsc + 12 + i * 12),
		}));

		const samples: Sample[] = [];
		let time = 0;
		for (let c = 0; c < chunks.length && samples.length < count; c++) {
			const run = [...runs].reverse().find((r) => r.first <= c);
			let offset = chunks[c];
			for (let s = 0; s < (run?.perChunk ?? 1) && samples.length < count; s++) {
				const i = samples.length;
				const duration = (durations[i] ?? durations.at(-1) ?? 0) / timescale;
				samples.push({ offset, size: sizes[i], time, duration });
				offset += sizes[i];
				time += duration;
			}
		}
		return samples;
	}
	return [];
}

interface Klv {
	key: string;
	type: string;
	structSize: number;
	repeat: number;
	data: Uint8Array;
}

function* klvs(bytes: Uint8Array): Generator<Klv> {
	const view = dv(bytes);
	let at = 0;
	while (at + 8 <= bytes.length) {
		const key = fourcc({ bytes: bytes, at: at });
		const type = String.fromCharCode(bytes[at + 4]);
		const structSize = bytes[at + 5];
		const repeat = view.getUint16(at + 6);
		const length = structSize * repeat;
		if (at + 8 + length > bytes.length) return;
		yield { key, type, structSize, repeat, data: bytes.subarray(at + 8, at + 8 + length) };
		at += 8 + Math.ceil(length / 4) * 4;
	}
}

function numbers(klv: Klv): number[] {
	const view = dv(klv.data);
	const size = { b: 1, B: 1, s: 2, S: 2, l: 4, L: 4, f: 4, d: 8 }[klv.type];
	if (!size) return [];
	const out: number[] = [];
	for (let at = 0; at + size <= klv.data.length; at += size) {
		switch (klv.type) {
			case "b": out.push(view.getInt8(at)); break;
			case "B": out.push(view.getUint8(at)); break;
			case "s": out.push(view.getInt16(at)); break;
			case "S": out.push(view.getUint16(at)); break;
			case "l": out.push(view.getInt32(at)); break;
			case "L": out.push(view.getUint32(at)); break;
			case "f": out.push(view.getFloat32(at)); break;
			case "d": out.push(view.getFloat64(at)); break;
		}
	}
	return out;
}

/** The streams of one GPMF payload: fourcc → rows of scaled values. */
export function parsePayload(payload: Uint8Array): Map<string, number[][]> {
	const streams = new Map<string, number[][]>();
	const walk = (bytes: Uint8Array) => {
		let scale: number[] = [1];
		for (const klv of klvs(bytes)) {
			if (klv.type === "\0") {
				walk(klv.data);
				continue;
			}
			if (klv.key === "SCAL") {
				scale = numbers(klv);
				continue;
			}
			if (!["CORI", "GRAV", "GYRO", "ACCL"].includes(klv.key)) continue;
			const flat = numbers(klv);
			const width = flat.length / Math.max(1, klv.repeat);
			const rows: number[][] = [];
			for (let r = 0; r < klv.repeat; r++)
				rows.push(
					flat
						.slice(r * width, (r + 1) * width)
						.map((v, i) => v / (scale[i] ?? scale[0] ?? 1)),
				);
			streams.set(klv.key, [...(streams.get(klv.key) ?? []), ...rows]);
		}
	};
	walk(payload);
	return streams;
}

/**
 * GoPro's camera axes (X out of the lens… per ORIN "ZXY" on MAX) mapped onto
 * FrameFlow's sphere axes: x right, y up, z forward. Vectors and quaternion
 * axes go through the same mapping.
 */
export function gpmfToSphere([x, y, z]: Vec3): Vec3 {
	return [-y, z, x];
}

const toSphereQuat = ([w, x, y, z]: number[]): Quat => {
	const [sx, sy, sz] = gpmfToSphere([x, y, z]);
	return [w, sx, sy, sz];
};

async function readMoov(file: Blob): Promise<Uint8Array | null> {
	let at = 0;
	while (at + 8 <= file.size) {
		const head = new Uint8Array(await file.slice(at, at + 16).arrayBuffer());
		const view = dv(head);
		let size = view.getUint32(0);
		if (size === 1) size = Number(view.getBigUint64(8));
		else if (size === 0) size = file.size - at;
		if (size < 8) return null;
		if (fourcc({ bytes: head, at: 4 }) === "moov")
			return new Uint8Array(await file.slice(at, at + size).arrayBuffer());
		at += size;
	}
	return null;
}

/** All motion samples in a GoPro file, or null when it has none. */
export async function readMotion(file: Blob): Promise<MotionSamples | null> {
	const moov = await readMoov(file);
	if (!moov) return null;
	const samples = gpmfSamples(moov);
	if (samples.length === 0) return null;
	const out: MotionSamples = { times: [] };
	const spread = ({ rows, s }: { rows: number[][]; s: Sample }) =>
		rows.map((_, i) => s.time + (s.duration * i) / Math.max(1, rows.length));
	for (const s of samples) {
		const payload = new Uint8Array(
			await file.slice(s.offset, s.offset + s.size).arrayBuffer(),
		);
		const streams = parsePayload(payload);
		const cori = streams.get("CORI");
		const grav = streams.get("GRAV");
		if (cori?.length) {
			out.times.push(...spread({ rows: cori, s }));
			out.orientations = [...(out.orientations ?? []), ...cori.map(toSphereQuat)];
		} else if (grav?.length) {
			out.times.push(...spread({ rows: grav, s }));
			out.gravity = [
				...(out.gravity ?? []),
				...grav.map((g) => gpmfToSphere([g[0], g[1], g[2]])),
			];
		}
		for (const key of ["GYRO", "ACCL"] as const) {
			const rows = streams.get(key);
			if (!rows?.length) continue;
			const target = key === "GYRO" ? "gyro" : "accel";
			const series = (out[target] ??= { times: [], values: [] });
			series.times.push(...spread({ rows: rows, s }));
			series.values.push(...rows.map((r) => gpmfToSphere([r[0], r[1], r[2]])));
		}
	}
	const has =
		out.orientations?.length || out.gravity?.length || (out.gyro && out.accel);
	return has ? out : null;
}
