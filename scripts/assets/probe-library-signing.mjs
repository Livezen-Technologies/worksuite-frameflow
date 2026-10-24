// Is the feed's signature stable, and does it match a published key? (diagnosis only)
//   node scripts/assets/probe-library-signing.mjs [feedBase]
import { createPublicKey, verify } from "node:crypto";
const base = (process.argv[2] || "https://frameflow.worksuitecloud.com/library/feed").replace(/\/$/, "");
const get = async (u) => {
	const r = await fetch(u, { cache: "no-store" });
	return { status: r.status, type: r.headers.get("content-type"), etag: r.headers.get("etag"), body: Buffer.from(await r.arrayBuffer()) };
};
const [c1, s1] = await Promise.all([get(`${base}/stable/catalog.json`), get(`${base}/stable/catalog.json.sig`)]);
const [c2, s2] = await Promise.all([get(`${base}/stable/catalog.json`), get(`${base}/stable/catalog.json.sig`)]);
const gen = (c) => /"generatedAt":\s*"([^"]+)"/.exec(c.body.toString())?.[1];
console.log(`catalog 1: generatedAt ${gen(c1)} etag ${c1.etag} ${c1.body.length} bytes`);
console.log(`catalog 2: generatedAt ${gen(c2)} etag ${c2.etag} ${c2.body.length} bytes`);
console.log(`catalogs identical: ${c1.body.equals(c2.body)}; signatures identical: ${s1.body.equals(s2.body)}`);
console.log(`sig1 ${s1.body.toString().trim()}\nsig2 ${s2.body.toString().trim()}`);
const keyPaths = ["/public-key.pem", "/public-key", "/stable/public-key.pem", "/catalog.pub", "/stable/catalog.pub", "/key.pem", "/.well-known/catalog-key", "/signing-key"];
const keys = [];
for (const p of [...keyPaths.map((k) => base + k), ...["/api/v1/public-key", "/api/v1/signing-key", "/api/v1/catalog/key", "/api/v1/feed/key", "/.well-known/frameflow-catalog-key"].map((k) => base.replace(/\/feed$/, "") + k)]) {
	const r = await get(p);
	const text = r.body.toString();
	console.log(`${r.status} ${r.type} ${p} ${JSON.stringify(text.slice(0, 120))}`);
	const pem = /-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/.exec(text)?.[0];
	if (pem) keys.push({ p, pem });
}
for (const { p, pem } of keys) {
	for (const [c, s, n] of [[c1, s1, 1], [c2, s2, 2]]) {
		const ok = verify(null, c.body, createPublicKey(pem), Buffer.from(s.body.toString().trim(), "base64"));
		console.log(`key from ${p} verifies pair ${n}: ${ok}`);
	}
}
// Cross-check pairs with the app's key too (catalog 1 with sig 2 and vice versa).
const app = createPublicKey("-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAf42Kl/5GTU8PTayweURzXqp6S4BBhkbQv360G+ohOB8=\n-----END PUBLIC KEY-----\n");
for (const [c, s, n] of [[c1, s1, "1/1"], [c1, s2, "1/2"], [c2, s1, "2/1"], [c2, s2, "2/2"]])
	console.log(`app key, catalog/sig ${n}: ${verify(null, c.body, app, Buffer.from(s.body.toString().trim(), "base64"))}`);
