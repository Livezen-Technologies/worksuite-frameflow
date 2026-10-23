// libheif (LGPL-3.0) is served as its own file instead of being bundled
// into the app's code, so anyone can replace it with their own build
// (LGPL section 4; decision D-8). Runs before dev and build.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve("libheif-js/package.json"));
const out = join(import.meta.dirname, "..", "public", "vendor", "libheif");
mkdirSync(out, { recursive: true });
copyFileSync(join(pkg, "libheif-wasm", "libheif-bundle.mjs"), join(out, "libheif-bundle.mjs"));
copyFileSync(join(pkg, "LICENSE"), join(out, "LICENSE-LGPL-3.0.txt"));
console.log("copy-libheif: public/vendor/libheif ready");
