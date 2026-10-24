// Low-level pieces of the asset download center (SRS AL-01..AL-12), with no
// Electron imports so the build script and tests can use them too:
//   - a tiny ZIP writer (stored or deflate) and a strict reader that rejects
//     path traversal, absolute paths, symlinks, encryption and zip64,
//   - SHA-256 of files and buffers,
//   - Ed25519 signing and verification of catalog.json (Node's crypto),
//   - catalog shape checks and semver comparison.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

// ---------- CRC-32 (zlib.crc32 isn't in every Node/Electron we run on) ----------

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

// ---------- ZIP writer ----------

/**
 * Builds a ZIP from `entries` ({ name, data }) in the order given. Times
 * are fixed (1980-01-01) so the same files always give the same bytes and
 * the same sha256. Files that don't shrink are stored.
 */
function createZip(entries) {
	const locals = [];
	const centrals = [];
	let offset = 0;
	for (const { name, data } of entries) {
		const safe = safeEntryName(name);
		if (!safe) throw new Error(`Bad zip entry name: ${name}`);
		const nameBuf = Buffer.from(safe, "utf8");
		const raw = Buffer.isBuffer(data) ? data : Buffer.from(data);
		const deflated = zlib.deflateRawSync(raw, { level: 9 });
		const useDeflate = deflated.length < raw.length;
		const body = useDeflate ? deflated : raw;
		const crc = crc32(raw);
		const header = Buffer.alloc(30);
		header.writeUInt32LE(0x04034b50, 0);
		header.writeUInt16LE(20, 4);
		header.writeUInt16LE(0x0800, 6); // UTF-8 names
		header.writeUInt16LE(useDeflate ? 8 : 0, 8);
		header.writeUInt16LE(0, 10); // time
		header.writeUInt16LE(0x21, 12); // date: 1980-01-01
		header.writeUInt32LE(crc, 14);
		header.writeUInt32LE(body.length, 18);
		header.writeUInt32LE(raw.length, 22);
		header.writeUInt16LE(nameBuf.length, 26);
		header.writeUInt16LE(0, 28);
		locals.push(header, nameBuf, body);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(0x031e, 4); // made by: Unix, 3.0
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(useDeflate ? 8 : 0, 10);
		central.writeUInt16LE(0, 12);
		central.writeUInt16LE(0x21, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(body.length, 20);
		central.writeUInt32LE(raw.length, 24);
		central.writeUInt16LE(nameBuf.length, 28);
		central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // regular file
		central.writeUInt32LE(offset, 42);
		centrals.push(central, nameBuf);
		offset += header.length + nameBuf.length + body.length;
	}
	const centralSize = centrals.reduce((n, b) => n + b.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, ...centrals, end]);
}

// ---------- ZIP reader ----------

/**
 * The entry name if it is a safe relative path, else null: no absolute
 * paths, drive letters, backslashes, empty or `.`/`..` segments, or NULs.
 */
function safeEntryName(name) {
	if (typeof name !== "string" || !name || name.length > 512) return null;
	if (name.includes("\0") || name.includes("\\")) return null;
	if (name.startsWith("/") || /^[a-zA-Z]:/.test(name)) return null;
	const parts = name.split("/");
	// A trailing slash marks a directory entry.
	if (parts[parts.length - 1] === "") parts.pop();
	if (parts.length === 0) return null;
	for (const part of parts) if (part === "" || part === "." || part === "..") return null;
	return name;
}

class ZipError extends Error {
	constructor(message) {
		super(message);
		this.code = "bad-zip";
	}
}

/**
 * Reads every entry of a ZIP buffer. Throws ZipError for anything unsafe or
 * unsupported. Limits: `maxEntries`, `maxTotalBytes` uncompressed.
 */
function readZip(buf, { maxEntries = 20000, maxTotalBytes = 2 * 1024 ** 3 } = {}) {
	const minEnd = Math.max(0, buf.length - 22 - 0xffff);
	let end = -1;
	for (let i = buf.length - 22; i >= minEnd; i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			end = i;
			break;
		}
	}
	if (end < 0) throw new ZipError("Not a zip file");
	const count = buf.readUInt16LE(end + 10);
	const centralSize = buf.readUInt32LE(end + 12);
	const centralOffset = buf.readUInt32LE(end + 16);
	if (count === 0xffff || centralOffset === 0xffffffff) throw new ZipError("Zip64 isn't supported");
	if (count > maxEntries) throw new ZipError("Too many files in the pack");
	if (centralOffset + centralSize > end) throw new ZipError("Corrupt zip directory");
	const entries = [];
	let total = 0;
	let p = centralOffset;
	for (let i = 0; i < count; i++) {
		if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError("Corrupt zip directory");
		const flags = buf.readUInt16LE(p + 8);
		const method = buf.readUInt16LE(p + 10);
		const crc = buf.readUInt32LE(p + 16);
		const compSize = buf.readUInt32LE(p + 20);
		const size = buf.readUInt32LE(p + 24);
		const nameLen = buf.readUInt16LE(p + 28);
		const extraLen = buf.readUInt16LE(p + 30);
		const commentLen = buf.readUInt16LE(p + 32);
		const external = buf.readUInt32LE(p + 38);
		const localOffset = buf.readUInt32LE(p + 42);
		const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
		p += 46 + nameLen + extraLen + commentLen;

		if (!safeEntryName(name)) throw new ZipError(`Unsafe path in pack: ${name}`);
		if (flags & 0x1) throw new ZipError("Encrypted packs aren't supported");
		const mode = (external >>> 16) & 0o170000;
		if (mode === 0o120000) throw new ZipError(`Symlinks aren't allowed in packs: ${name}`);
		if (name.endsWith("/")) continue;
		if (method !== 0 && method !== 8) throw new ZipError(`Unsupported compression in ${name}`);
		if (compSize === 0xffffffff || size === 0xffffffff) throw new ZipError("Zip64 isn't supported");
		total += size;
		if (total > maxTotalBytes) throw new ZipError("Pack is too large when unpacked");

		if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) throw new ZipError(`Corrupt entry ${name}`);
		const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
		if (start + compSize > buf.length) throw new ZipError(`Truncated entry ${name}`);
		const body = buf.subarray(start, start + compSize);
		let data;
		try {
			data = method === 0 ? Buffer.from(body) : zlib.inflateRawSync(body, { maxOutputLength: Math.max(1, size) });
		} catch {
			throw new ZipError(`Couldn't unpack ${name}`);
		}
		if (data.length !== size) throw new ZipError(`Size mismatch in ${name}`);
		if (crc32(data) !== crc) throw new ZipError(`Checksum mismatch in ${name}`);
		entries.push({ name, data });
	}
	return entries;
}

/** `rel` joined to `root`, or null if it would land outside `root`. */
function resolveInside(root, rel) {
	const base = path.resolve(root);
	const target = path.resolve(base, rel);
	if (target !== base && !target.startsWith(base + path.sep)) return null;
	return target;
}

/**
 * Unpacks a ZIP buffer into `dest` (created). Every entry is checked
 * before anything is written, so a bad pack leaves nothing behind.
 */
function extractZip(buf, dest, options) {
	const entries = readZip(buf, options);
	const targets = entries.map(({ name, data }) => {
		const target = resolveInside(dest, name);
		if (!target) throw new ZipError(`Unsafe path in pack: ${name}`);
		return { target, data };
	});
	fs.mkdirSync(dest, { recursive: true });
	for (const { target, data } of targets) {
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, data);
	}
	return entries.map((e) => e.name);
}

// ---------- hashes and signatures ----------

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function sha256File(file) {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash("sha256");
		fs.createReadStream(file)
			.on("data", (chunk) => hash.update(chunk))
			.on("error", reject)
			.on("end", () => resolve(hash.digest("hex")));
	});
}

/** Base64 Ed25519 signature of `data` with a PEM private key. */
function signCatalog(data, privateKeyPem) {
	return crypto.sign(null, Buffer.from(data), crypto.createPrivateKey(privateKeyPem)).toString("base64");
}

/** True when `signature` (base64) is a valid Ed25519 signature of `data`. */
function verifyCatalog(data, signature, publicKeyPem) {
	try {
		const key = crypto.createPublicKey(publicKeyPem);
		if (key.asymmetricKeyType !== "ed25519") return false;
		const sig = Buffer.from(String(signature).trim(), "base64");
		if (sig.length !== 64) return false;
		return crypto.verify(null, Buffer.from(data), key, sig);
	} catch {
		return false;
	}
}

// ---------- catalog ----------

const PACK_TYPES = ["motion", "text-animations", "text-templates", "video-templates", "sounds", "transitions", "effects", "filters", "color-profiles", "luts", "fonts"];
const PACK_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Problems with a parsed catalog (empty when it's usable). */
function catalogProblems(catalog) {
	const problems = [];
	if (!catalog || typeof catalog !== "object") return ["catalog isn't an object"];
	if (catalog.schema !== 1) problems.push("schema must be 1");
	if (!Array.isArray(catalog.packs)) return [...problems, "packs must be a list"];
	const ids = new Set();
	for (const [i, pack] of catalog.packs.entries()) {
		const at = `packs[${i}]`;
		if (!pack || typeof pack !== "object") { problems.push(`${at} isn't an object`); continue; }
		if (!PACK_ID.test(pack.id ?? "")) problems.push(`${at}.id is invalid`);
		if (ids.has(pack.id)) problems.push(`${at}.id ${pack.id} is duplicated`);
		ids.add(pack.id);
		if (!PACK_TYPES.includes(pack.type)) problems.push(`${at}.type is invalid`);
		if (!SEMVER.test(pack.version ?? "")) problems.push(`${at}.version isn't semver`);
		if (!SEMVER.test(pack.minAppVersion ?? "")) problems.push(`${at}.minAppVersion isn't semver`);
		if (!/^[0-9a-f]{64}$/.test(pack.sha256 ?? "")) problems.push(`${at}.sha256 is invalid`);
		if (!(Number.isInteger(pack.sizeBytes) && pack.sizeBytes > 0)) problems.push(`${at}.sizeBytes is invalid`);
		if (!["free", "pro"].includes(pack.plan)) problems.push(`${at}.plan is invalid`);
		for (const key of ["title", "description", "licence", "files"]) if (typeof pack[key] !== "string" || !pack[key]) problems.push(`${at}.${key} is missing`);
		if (!Array.isArray(pack.languages)) problems.push(`${at}.languages must be a list`);
		if (!pack.tags || typeof pack.tags !== "object") problems.push(`${at}.tags is missing`);
	}
	return problems;
}

/** -1, 0 or 1. Pre-releases sort before their release. */
function compareSemver(a, b) {
	const parse = (v) => {
		const [core, pre] = String(v).replace(/^v/, "").split("-", 2);
		return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: pre ?? null };
	};
	const x = parse(a);
	const y = parse(b);
	for (let i = 0; i < 3; i++) if ((x.nums[i] ?? 0) !== (y.nums[i] ?? 0)) return (x.nums[i] ?? 0) > (y.nums[i] ?? 0) ? 1 : -1;
	if (x.pre === y.pre) return 0;
	if (x.pre === null) return 1;
	if (y.pre === null) return -1;
	return x.pre > y.pre ? 1 : -1;
}

module.exports = {
	crc32,
	createZip,
	readZip,
	extractZip,
	safeEntryName,
	resolveInside,
	ZipError,
	sha256,
	sha256File,
	signCatalog,
	verifyCatalog,
	catalogProblems,
	compareSemver,
	PACK_TYPES,
	PACK_ID,
	SEMVER,
};
