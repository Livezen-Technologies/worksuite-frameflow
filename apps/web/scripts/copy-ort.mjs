// onnxruntime-web (MIT) for on-device AI export (SRS EX-20, EX-21) is served
// as its own files and loaded at runtime, so the editor bundle stays small
// and the runtime only downloads when AI export is used. Runs before dev and build.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
// The package only exports its entry points; its folder is two levels up.
const pkg = join(dirname(require.resolve("onnxruntime-web")), "..");
const out = join(import.meta.dirname, "..", "public", "vendor", "ort");
mkdirSync(out, { recursive: true });
for (const file of [
	"ort.webgpu.bundle.min.mjs",
	"ort-wasm-simd-threaded.jsep.mjs",
	"ort-wasm-simd-threaded.jsep.wasm",
])
	copyFileSync(join(pkg, "dist", file), join(out, file));
// The npm package ships no LICENSE file; record its licence beside the files.
const { version, license } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
writeFileSync(
	join(out, "NOTICE.txt"),
	`onnxruntime-web ${version}, ${license} licence, Copyright (c) Microsoft Corporation.\nhttps://github.com/microsoft/onnxruntime\n`,
);
console.log("copy-ort: public/vendor/ort ready");
