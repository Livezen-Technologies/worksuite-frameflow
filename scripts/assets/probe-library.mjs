// Lists what the library site answers at likely feed and API paths (diagnosis only).
//   node scripts/assets/probe-library.mjs [origin]
const origin = (process.argv[2] || "https://frameflow.worksuitecloud.com").replace(/\/$/, "");
const paths = [
	"/library/", "/library/catalog.json", "/library/stable/catalog.json", "/library/feed/stable/catalog.json",
	"/library/api/v1/catalog", "/library/api/v1/assets", "/library/api/v1/packs", "/api/v1/catalog", "/api/v1/assets", "/api/v1/packs",
	"/api/catalog", "/api/assets", "/library/api/catalog", "/library/api/assets", "/assets/stable/catalog.json", "/stable/catalog.json",
	"/library/feed", "/library/manifest.json", "/library/index.json",
];
const hosts = [origin, "https://library.frameflow.worksuitecloud.com", "https://download.worksuitecloud.com"];
for (const host of hosts) {
	for (const path of host === origin ? paths : ["/", "/stable/catalog.json", "/feed/stable/catalog.json", "/api/v1/assets", "/api/v1/catalog", "/assets/stable/catalog.json"]) {
		try {
			const res = await fetch(host + path, { redirect: "follow" });
			const text = await res.text();
			console.log(`${res.status} ${(res.headers.get("content-type") || "").padEnd(32)} ${String(text.length).padStart(7)}  ${host}${path}  ${JSON.stringify(text.slice(0, 90))}`);
		} catch (error) {
			console.log(`ERR ${host}${path} ${error.message}`);
		}
	}
}
// Script tags of the library page reveal its API base.
const html = await (await fetch(`${origin}/library/`)).text();
for (const src of html.matchAll(/src="([^"]+\.js)"/g)) {
	const js = await (await fetch(new URL(src[1], `${origin}/library/`))).text();
	const urls = [...new Set(js.match(/["'`](https?:\/\/[^"'`\s]+|\/(?:api|v1|library)[^"'`\s]{2,80})["'`]/g) ?? [])].slice(0, 60);
	console.log(`\n${src[1]} (${js.length} bytes) mentions:\n  ${urls.join("\n  ")}`);
}
