// Ad-hoc signs the macOS app after packaging and before the .dmg is made.
// Without any signature, Apple Silicon reports a downloaded app as "damaged".
// electron-builder skips signing when no certificate is present, so it is
// done here. Replace with a Developer ID + notarisation when one exists.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
	if (context.electronPlatformName !== "darwin") return;
	const appPath = path.join(
		context.appOutDir,
		`${context.packager.appInfo.productFilename}.app`,
	);
	execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
		stdio: "inherit",
	});
};
