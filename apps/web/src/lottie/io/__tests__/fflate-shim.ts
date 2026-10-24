import { mock } from "bun:test";
import { deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * Test-only stand-in for the four fflate functions the dotLottie code uses,
 * registered only when fflate isn't installed (some CI sandboxes). Real
 * ZIP bytes, via node:zlib, so archives stay interoperable.
 */
export function ensureFflate() {
	try {
		require("fflate");
		return;
	} catch {
		// Fall through to the shim.
	}
	const crcTable = new Uint32Array(256).map((_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc32 = (buf: Uint8Array) => {
		let c = 0xffffffff;
		for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const zipSync = (files: Record<string, Uint8Array | [Uint8Array, unknown]>) => {
		const parts: Buffer[] = [];
		const central: Buffer[] = [];
		let offset = 0;
		for (const [name, value] of Object.entries(files)) {
			const raw = Buffer.from(Array.isArray(value) ? value[0] : value);
			const body = deflateRawSync(raw);
			const nameBuf = Buffer.from(name, "utf8");
			const h = Buffer.alloc(30);
			h.writeUInt32LE(0x04034b50, 0);
			h.writeUInt16LE(20, 4);
			h.writeUInt16LE(0x0800, 6);
			h.writeUInt16LE(8, 8);
			h.writeUInt16LE(0x21, 12);
			h.writeUInt32LE(crc32(raw), 14);
			h.writeUInt32LE(body.length, 18);
			h.writeUInt32LE(raw.length, 22);
			h.writeUInt16LE(nameBuf.length, 26);
			const c = Buffer.alloc(46);
			c.writeUInt32LE(0x02014b50, 0);
			c.writeUInt16LE(20, 4);
			c.writeUInt16LE(20, 6);
			c.writeUInt16LE(0x0800, 8);
			c.writeUInt16LE(8, 10);
			c.writeUInt16LE(0x21, 14);
			c.writeUInt32LE(crc32(raw), 16);
			c.writeUInt32LE(body.length, 20);
			c.writeUInt32LE(raw.length, 24);
			c.writeUInt16LE(nameBuf.length, 28);
			c.writeUInt32LE(offset, 42);
			parts.push(h, nameBuf, body);
			central.push(c, nameBuf);
			offset += 30 + nameBuf.length + body.length;
		}
		const cd = Buffer.concat(central);
		const end = Buffer.alloc(22);
		end.writeUInt32LE(0x06054b50, 0);
		end.writeUInt16LE(Object.keys(files).length, 8);
		end.writeUInt16LE(Object.keys(files).length, 10);
		end.writeUInt32LE(cd.length, 12);
		end.writeUInt32LE(offset, 16);
		return new Uint8Array(Buffer.concat([...parts, cd, end]));
	};
	const unzipSync = (bytes: Uint8Array) => {
		const buf = Buffer.from(bytes);
		const out: Record<string, Uint8Array> = {};
		let p = 0;
		while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
			const method = buf.readUInt16LE(p + 8);
			const size = buf.readUInt32LE(p + 18);
			const nameLen = buf.readUInt16LE(p + 26);
			const extra = buf.readUInt16LE(p + 28);
			const name = buf.subarray(p + 30, p + 30 + nameLen).toString("utf8");
			const data = buf.subarray(p + 30 + nameLen + extra, p + 30 + nameLen + extra + size);
			out[name] = new Uint8Array(method === 8 ? inflateRawSync(data) : data);
			p += 30 + nameLen + extra + size;
		}
		return out;
	};
	mock.module("fflate", () => ({
		zipSync,
		unzipSync,
		strToU8: (s: string) => new TextEncoder().encode(s),
		strFromU8: (b: Uint8Array) => new TextDecoder().decode(b),
	}));
}
