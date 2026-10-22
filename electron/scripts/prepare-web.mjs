// Copies the Next.js standalone build of apps/web into electron/web so
// electron-builder can ship it as an extra resource.
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const electronDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(electronDir, "..", "apps", "web");
const standalone = join(webDir, ".next", "standalone");
const out = join(electronDir, "web");

if (!existsSync(standalone)) {
	console.error("Missing apps/web/.next/standalone — run the web build first.");
	process.exit(1);
}

rmSync(out, { recursive: true, force: true });
// dereference: bun/pnpm symlinks would break once packaged
cpSync(standalone, out, { recursive: true, dereference: true });
cpSync(join(webDir, ".next", "static"), join(out, "apps", "web", ".next", "static"), { recursive: true });
cpSync(join(webDir, "public"), join(out, "apps", "web", "public"), { recursive: true });

// electron-builder never ships a node_modules folder at the root of an extra
// resource, so fold the hoisted packages into the app's own node_modules.
// Packages the app already has its own copy of are kept as they are.
const rootModules = join(out, "node_modules");
const appModules = join(out, "apps", "web", "node_modules");
for (const name of readdirSync(rootModules)) {
	const target = join(appModules, name);
	if (!existsSync(target)) cpSync(join(rootModules, name), target, { recursive: true });
}
rmSync(rootModules, { recursive: true, force: true });

console.log(`Prepared web server in ${out}`);
