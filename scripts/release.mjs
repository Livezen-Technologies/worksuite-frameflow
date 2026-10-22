// Cuts a release: moves CHANGELOG.md's Unreleased notes under a new version
// heading and sets that version in electron/package.json (the app version).
//
//   node scripts/release.mjs patch|minor|major|<x.y.z>
//
// Then commit, and tag `v<version>` to have the Desktop Build workflow attach
// installers to a GitHub Release.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const changelogPath = join(root, "CHANGELOG.md");
const packagePath = join(root, "electron", "package.json");

function fail(message) {
	console.error(message);
	process.exit(1);
}

function nextVersion(current, bump) {
	if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
	const [major, minor, patch] = current.split(".").map(Number);
	if (bump === "major") return `${major + 1}.0.0`;
	if (bump === "minor") return `${major}.${minor + 1}.0`;
	if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
	fail("Usage: node scripts/release.mjs patch|minor|major|<x.y.z>");
}

const pkgText = readFileSync(packagePath, "utf8");
const pkg = JSON.parse(pkgText);
const version = nextVersion(pkg.version, process.argv[2]);

const changelog = readFileSync(changelogPath, "utf8");
if (changelog.includes(`## [${version}]`)) fail(`CHANGELOG.md already has ${version}.`);

const match = changelog.match(/## \[Unreleased\]\n([\s\S]*?)(?=\n## \[|$)/);
if (!match) fail("CHANGELOG.md has no ## [Unreleased] section.");
const notes = match[1].trim();
if (!/^- /m.test(notes)) fail("Unreleased has no entries; nothing to release.");

const date = new Date().toISOString().slice(0, 10);
writeFileSync(
	changelogPath,
	changelog.replace(match[0], `## [Unreleased]\n\n## [${version}] - ${date}\n\n${notes}\n`),
);
writeFileSync(packagePath, pkgText.replace(`"version": "${pkg.version}"`, `"version": "${version}"`));

console.log(`Released ${version}: CHANGELOG.md and electron/package.json updated.`);
console.log(`Next: git commit -am "Release v${version}" && git tag v${version} && git push --follow-tags`);
