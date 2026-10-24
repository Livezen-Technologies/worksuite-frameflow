// Diagnoses the Asset Library feed: what <base>/<channel>/catalog.json and
// catalog.json.sig return, and whether the signature verifies with the key
// the app trusts (electron/asset-store.js).
//   node scripts/assets/check-library-feed.mjs [base] [channel]
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const base = (process.argv[2] || "https://frameflow.worksuitecloud.com/library/feed").replace(/\/$/, "");
const channel = process.argv[3] || "stable";
const store = readFileSync(join(import.meta.dirname, "..", "..", "electron", "asset-store.js"), "utf8");
const pem = /"(-----BEGIN PUBLIC KEY-----\\n[^"]+-----END PUBLIC KEY-----\\n)"/.exec(store)?.[1]?.replace(/\\n/g, "\n");

async function get(url) {
	const res = await fetch(url, { cache: "no-store" });
	const body = Buffer.from(await res.arrayBuffer());
	console.log(`\n${url}\n  ${res.status} ${res.headers.get("content-type")} ${body.length} bytes, final URL ${res.url}`);
	console.log(`  starts: ${JSON.stringify(body.subarray(0, 160).toString("utf8"))}`);
	return { res, body };
}

const catalog = await get(`${base}/${channel}/catalog.json`);
const sig = await get(`${base}/${channel}/catalog.json.sig`);
try {
	const parsed = JSON.parse(catalog.body.toString("utf8"));
	console.log(`\ncatalog: ${Array.isArray(parsed.packs) ? `${parsed.packs.length} packs` : "no packs list"}, keys: ${Object.keys(parsed).join(", ")}`);
} catch (error) {
	console.log(`\ncatalog is not JSON: ${error.message}`);
}
const raw = Buffer.from(sig.body.toString("utf8").trim(), "base64");
console.log(`signature: ${raw.length} bytes after base64 decode (Ed25519 needs 64)`);
if (!pem) throw new Error("Couldn't read the public key from electron/asset-store.js");
const ok = raw.length === 64 && verify(null, catalog.body, createPublicKey(pem), raw);
console.log(ok ? "\nRESULT: signature VERIFIES with the app's key." : "\nRESULT: signature does NOT verify with the app's key.");
// Common causes, checked: a signature over different bytes (re-serialised JSON, CRLF, gzip).
if (!ok && raw.length === 64) {
	const text = catalog.body.toString("utf8");
	for (const [name, variant] of [
		["trimmed", text.trim()],
		["with trailing newline", `${text.trimEnd()}\n`],
		["LF line endings", text.replace(/\r\n/g, "\n")],
		["re-serialised compact", (() => { try { return JSON.stringify(JSON.parse(text)); } catch { return null; } })()],
		["re-serialised pretty (tab)", (() => { try { return JSON.stringify(JSON.parse(text), null, "\t"); } catch { return null; } })()],
	]) {
		if (variant && verify(null, Buffer.from(variant), createPublicKey(pem), raw)) console.log(`  …but it verifies over the catalog ${name}.`);
	}
}
process.exit(ok ? 0 : 1);
