// The Worksuite Assets pack (repo: assets/worksuite-pack) is served as static
// files from public/worksuite-pack, so the web build, the standalone server
// and the desktop app (electron/scripts/prepare-web.mjs copies public/) all
// include it. Runs before dev and build.
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const from = join(import.meta.dirname, "..", "..", "..", "assets", "worksuite-pack");
const out = join(import.meta.dirname, "..", "public", "worksuite-pack");
if (!existsSync(join(from, "index.json"))) {
	console.error("copy-worksuite-pack: assets/worksuite-pack/index.json is missing");
	process.exit(1);
}
rmSync(out, { recursive: true, force: true });
cpSync(from, out, {
	recursive: true,
	filter: (path) => !path.endsWith("README.md"),
});
console.log("copy-worksuite-pack: public/worksuite-pack ready");
