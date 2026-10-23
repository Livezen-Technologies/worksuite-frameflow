/**
 * Writes spherical metadata into an exported MP4 (SRS VR-20) so YouTube,
 * Facebook and headsets play it as 360°: Spherical Video V2 (st3d + sv3d in
 * the video sample entry) and V1 (a GSpherical XMP uuid box in the track).
 */

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);
const VISUAL_SAMPLE_ENTRY_HEADER = 8 + 78;
const AUDIO_SAMPLE_ENTRY_HEADER = 8 + 28;
const V1_UUID = [
	0xff, 0xcc, 0x82, 0x63, 0xf8, 0x55, 0x4a, 0x93, 0x88, 0x14, 0x58, 0x7a, 0x02,
	0x52, 0x1f, 0xdd,
];

interface Box {
	type: string;
	start: number;
	headerSize: number;
	size: number;
}

function readBoxes({
	bytes,
	start,
	end,
}: {
	bytes: Uint8Array;
	start: number;
	end: number;
}): Box[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const boxes: Box[] = [];
	let offset = start;
	while (offset + 8 <= end) {
		let size = view.getUint32(offset);
		let headerSize = 8;
		const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
		if (size === 1) {
			size = Number(view.getBigUint64(offset + 8));
			headerSize = 16;
		} else if (size === 0) {
			size = end - offset;
		}
		if (size < headerSize || offset + size > end) break;
		boxes.push({ type, start: offset, headerSize, size });
		offset += size;
	}
	return boxes;
}

function box({ type, body }: { type: string; body: Uint8Array[] }): Uint8Array {
	const size = 8 + body.reduce((n, b) => n + b.length, 0);
	const out = new Uint8Array(size);
	new DataView(out.buffer).setUint32(0, size);
	out.set(
		Array.from(type, (c) => c.charCodeAt(0)),
		4,
	);
	let offset = 8;
	for (const part of body) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

const fullBoxHeader = () => new Uint8Array(4);

function u32s(values: number[]): Uint8Array {
	const out = new Uint8Array(values.length * 4);
	const view = new DataView(out.buffer);
	values.forEach((v, i) => view.setUint32(i * 4, v >>> 0));
	return out;
}

export function sphericalV2Boxes(): Uint8Array[] {
	const st3d = box({
		type: "st3d",
		body: [fullBoxHeader(), new Uint8Array([0])],
	});
	const svhd = box({
		type: "svhd",
		body: [fullBoxHeader(), new TextEncoder().encode("Worksuite FrameFlow\0")],
	});
	const prhd = box({ type: "prhd", body: [fullBoxHeader(), u32s([0, 0, 0])] });
	const equi = box({
		type: "equi",
		body: [fullBoxHeader(), u32s([0, 0, 0, 0])],
	});
	const proj = box({ type: "proj", body: [prhd, equi] });
	return [st3d, box({ type: "sv3d", body: [svhd, proj] })];
}

export function sphericalV1Box(): Uint8Array {
	const xml = `<?xml version="1.0"?><rdf:SphericalVideo xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:GSpherical="http://ns.google.com/videos/1.0/spherical/"><GSpherical:Spherical>true</GSpherical:Spherical><GSpherical:Stitched>true</GSpherical:Stitched><GSpherical:StitchingSoftware>Worksuite FrameFlow</GSpherical:StitchingSoftware><GSpherical:ProjectionType>equirectangular</GSpherical:ProjectionType></rdf:SphericalVideo>`;
	return box({
		type: "uuid",
		body: [new Uint8Array(V1_UUID), new TextEncoder().encode(xml)],
	});
}

/**
 * Spatial Audio box (VR-21): first-order periphonic ambisonics, ACN channel
 * order, SN3D normalisation — what YouTube and headsets expect.
 */
export function spatialAudioBox(): Uint8Array {
	const body = new Uint8Array(2 + 4 + 2 + 4 + 4 * 4);
	const view = new DataView(body.buffer);
	view.setUint8(0, 0); // version
	view.setUint8(1, 0); // periphonic
	view.setUint32(2, 1); // order
	view.setUint8(6, 0); // ACN
	view.setUint8(7, 0); // SN3D
	view.setUint32(8, 4);
	for (let i = 0; i < 4; i++) view.setUint32(12 + i * 4, i);
	return box({ type: "SA3D", body: [body] });
}

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let offset = 0;
	for (const p of parts) {
		out.set(p, offset);
		offset += p.length;
	}
	return out;
}

/** Copies a box with a new body, fixing its size (32-bit header only). */
function rebuild({
	bytes,
	at,
	body,
}: {
	bytes: Uint8Array;
	at: Box;
	body: Uint8Array;
}): Uint8Array {
	const header = bytes.slice(at.start, at.start + at.headerSize);
	const size = at.headerSize + body.length;
	const view = new DataView(header.buffer);
	if (at.headerSize === 16) view.setBigUint64(8, BigInt(size));
	else view.setUint32(0, size);
	return concat([header, body]);
}

function isV1Box({ bytes, at }: { bytes: Uint8Array; at: Box }): boolean {
	if (at.type !== "uuid") return false;
	const id = bytes.subarray(
		at.start + at.headerSize,
		at.start + at.headerSize + 16,
	);
	return V1_UUID.every((b, i) => id[i] === b);
}

function handlerOf({ bytes, trak }: { bytes: Uint8Array; trak: Box }) {
	const mdia = readBoxes({
		bytes,
		start: trak.start + trak.headerSize,
		end: trak.start + trak.size,
	}).find((b) => b.type === "mdia");
	if (!mdia) return "";
	const hdlr = readBoxes({
		bytes,
		start: mdia.start + mdia.headerSize,
		end: mdia.start + mdia.size,
	}).find((b) => b.type === "hdlr");
	if (!hdlr) return "";
	const at = hdlr.start + hdlr.headerSize + 8;
	return String.fromCharCode(...bytes.subarray(at, at + 4));
}

function isVideoTrack({ bytes, trak }: { bytes: Uint8Array; trak: Box }) {
	const mdia = readBoxes({
		bytes,
		start: trak.start + trak.headerSize,
		end: trak.start + trak.size,
	}).find((b) => b.type === "mdia");
	if (!mdia) return false;
	const hdlr = readBoxes({
		bytes,
		start: mdia.start + mdia.headerSize,
		end: mdia.start + mdia.size,
	}).find((b) => b.type === "hdlr");
	if (!hdlr) return false;
	const at = hdlr.start + hdlr.headerSize + 8;
	return String.fromCharCode(...bytes.subarray(at, at + 4)) === "vide";
}

/** Rewrites `container`, transforming the boxes inside it. */
function rewriteContainer({
	bytes,
	container,
	transform,
}: {
	bytes: Uint8Array;
	container: Box;
	transform: (child: Box) => Uint8Array | null;
}): Uint8Array {
	const children = readBoxes({
		bytes,
		start: container.start + container.headerSize,
		end: container.start + container.size,
	});
	const parts = children.map(
		(child) =>
			transform(child) ?? bytes.slice(child.start, child.start + child.size),
	);
	return rebuild({ bytes, at: container, body: concat(parts) });
}

function rewriteStsd({
	bytes,
	stsd,
	audio = false,
}: {
	bytes: Uint8Array;
	stsd: Box;
	audio?: boolean;
}) {
	const headerSize = audio
		? AUDIO_SAMPLE_ENTRY_HEADER
		: VISUAL_SAMPLE_ENTRY_HEADER;
	const dropped = audio ? ["SA3D"] : ["st3d", "sv3d"];
	const bodyStart = stsd.start + stsd.headerSize;
	const entries = readBoxes({
		bytes,
		start: bodyStart + 8,
		end: stsd.start + stsd.size,
	});
	const parts = entries.map((entry, i) => {
		const raw = bytes.slice(entry.start, entry.start + entry.size);
		if (i > 0 || entry.size < headerSize) return raw;
		// Only 4-channel sound is ambisonic; stereo stays plain.
		if (audio && dataView(bytes).getUint16(entry.start + 24) !== 4) return raw;
		const kept = readBoxes({
			bytes,
			start: entry.start + headerSize,
			end: entry.start + entry.size,
		})
			.filter((b) => !dropped.includes(b.type))
			.map((b) => bytes.slice(b.start, b.start + b.size));
		const fixed = bytes.slice(entry.start + entry.headerSize, entry.start + headerSize);
		return rebuild({
			bytes,
			at: entry,
			body: concat([
				fixed,
				...kept,
				...(audio ? [spatialAudioBox()] : sphericalV2Boxes()),
			]),
		});
	});
	return rebuild({
		bytes,
		at: stsd,
		body: concat([bytes.slice(bodyStart, bodyStart + 8), ...parts]),
	});
}

const dataView = (bytes: Uint8Array) =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function shiftChunkOffsets({
	moov,
	delta,
}: {
	moov: Uint8Array;
	delta: number;
}): void {
	const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
	const walk = ({ start, end }: { start: number; end: number }) => {
		for (const b of readBoxes({ bytes: moov, start, end })) {
			const body = b.start + b.headerSize;
			if (CONTAINERS.has(b.type)) walk({ start: body, end: b.start + b.size });
			if (b.type === "stco") {
				const count = view.getUint32(body + 4);
				for (let i = 0; i < count; i++) {
					const at = body + 8 + i * 4;
					view.setUint32(at, view.getUint32(at) + delta);
				}
			} else if (b.type === "co64") {
				const count = view.getUint32(body + 4);
				for (let i = 0; i < count; i++) {
					const at = body + 8 + i * 8;
					view.setBigUint64(at, view.getBigUint64(at) + BigInt(delta));
				}
			}
		}
	};
	walk({ start: 8, end: moov.length });
}

export function injectSphericalMetadata(input: Uint8Array): Uint8Array {
	const top = readBoxes({ bytes: input, start: 0, end: input.length });
	const moov = top.find((b) => b.type === "moov");
	if (!moov || moov.headerSize !== 8) return input;

	const visitor = (audio: boolean) => {
		const visit = (child: Box): Uint8Array | null => {
			if (child.type === "stsd")
				return rewriteStsd({ bytes: input, stsd: child, audio });
			if (CONTAINERS.has(child.type)) {
				return rewriteContainer({
					bytes: input,
					container: child,
					transform: visit,
				});
			}
			return null;
		};
		return visit;
	};
	const visit = visitor(false);
	const newMoov = rewriteContainer({
		bytes: input,
		container: moov,
		transform: (child) => {
			if (child.type !== "trak") return null;
			if (handlerOf({ bytes: input, trak: child }) === "soun") {
				return rewriteContainer({
					bytes: input,
					container: child,
					transform: visitor(true),
				});
			}
			if (!isVideoTrack({ bytes: input, trak: child })) return null;
			const rewritten = rewriteContainer({
				bytes: input,
				container: child,
				transform: (inner) =>
					isV1Box({ bytes: input, at: inner })
						? new Uint8Array()
						: visit(inner),
			});
			// V1 metadata at the end of the video track.
			const trakBox: Box = {
				type: "trak",
				start: 0,
				headerSize: 8,
				size: rewritten.length,
			};
			return rebuild({
				bytes: rewritten,
				at: trakBox,
				body: concat([rewritten.subarray(8), sphericalV1Box()]),
			});
		},
	});

	const delta = newMoov.length - moov.size;
	const mdatAfterMoov = top.some(
		(b) => b.type === "mdat" && b.start > moov.start,
	);
	if (mdatAfterMoov && delta !== 0) shiftChunkOffsets({ moov: newMoov, delta });

	return concat([
		input.subarray(0, moov.start),
		newMoov,
		input.subarray(moov.start + moov.size),
	]);
}
