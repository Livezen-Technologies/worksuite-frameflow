import { readHdrMetadata } from "./webm-hdr-metadata";

/**
 * MaxCLL / MaxFALL that cameras and grading tools store in the file
 * (SRS HD-01): the MP4/MOV "clli" box, or WebM/MKV Colour. Only the start
 * and end of the file are read, where these boxes live.
 */
const SCAN = 4 * 1024 * 1024;

function findClli(
	bytes: Uint8Array,
): { maxCll: number; maxFall: number } | null {
	for (let i = 4; i + 8 <= bytes.length; i++) {
		// "clli" fourcc, preceded by the box size (always 12 + header).
		if (
			bytes[i] === 0x63 &&
			bytes[i + 1] === 0x6c &&
			bytes[i + 2] === 0x6c &&
			bytes[i + 3] === 0x69
		) {
			const size =
				(bytes[i - 4] << 24) |
				(bytes[i - 3] << 16) |
				(bytes[i - 2] << 8) |
				bytes[i - 1];
			if (size !== 12) continue;
			const maxCll = (bytes[i + 4] << 8) | bytes[i + 5];
			const maxFall = (bytes[i + 6] << 8) | bytes[i + 7];
			if (maxCll > 0 && maxCll <= 10000) return { maxCll, maxFall };
		}
	}
	return null;
}

export async function readLightLevel({
	file,
}: {
	file: Blob;
}): Promise<{ maxCll: number; maxFall?: number } | null> {
	try {
		const head = new Uint8Array(await file.slice(0, SCAN).arrayBuffer());
		if (
			head[0] === 0x1a &&
			head[1] === 0x45 &&
			head[2] === 0xdf &&
			head[3] === 0xa3
		) {
			const meta = readHdrMetadata({ buffer: head.buffer });
			return meta.maxCll
				? { maxCll: meta.maxCll, maxFall: meta.maxFall }
				: null;
		}
		const found = findClli(head);
		if (found) return found;
		if (file.size > SCAN) {
			const tail = new Uint8Array(
				await file.slice(Math.max(SCAN, file.size - SCAN)).arrayBuffer(),
			);
			return findClli(tail);
		}
		return null;
	} catch {
		return null;
	}
}
