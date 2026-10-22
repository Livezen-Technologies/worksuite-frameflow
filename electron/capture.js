// Screen, camera and microphone access for recording (SRS AR-19–21, SC-01,
// SC-03, SC-10). Media permissions are granted only to the app's own origin;
// the page picks a screen or window from `sources()` before it calls
// getDisplayMedia, and the main process hands that source over.
const { desktopCapturer, systemPreferences } = require("electron");

const MEDIA_PERMISSIONS = new Set(["media", "display-capture"]);
let chosenSourceId = null;

function isAppOrigin({ origin, url }) {
	return typeof url === "string" && url.startsWith(origin);
}

function setupCapture({ session, origin }) {
	session.setPermissionRequestHandler((webContents, permission, callback) => {
		if (!MEDIA_PERMISSIONS.has(permission)) return callback(true);
		callback(isAppOrigin({ origin, url: webContents.getURL() }));
	});
	session.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
		if (!MEDIA_PERMISSIONS.has(permission)) return true;
		return isAppOrigin({ origin, url: `${requestingOrigin}/` });
	});
	session.setDisplayMediaRequestHandler(async (request, callback) => {
		if (!isAppOrigin({ origin, url: request.frame?.url })) return callback({});
		const sources = await desktopCapturer.getSources({
			types: ["screen", "window"],
		});
		const source =
			sources.find((s) => s.id === chosenSourceId) ??
			sources.find((s) => s.id.startsWith("screen:"));
		chosenSourceId = null;
		if (!source) return callback({});
		// System audio is only available on Windows and Linux (SC-03).
		const audio =
			request.audioRequested && process.platform !== "darwin"
				? "loopback"
				: undefined;
		callback(audio ? { video: source, audio } : { video: source });
	});
}

async function listSources() {
	const sources = await desktopCapturer.getSources({
		types: ["screen", "window"],
		thumbnailSize: { width: 320, height: 180 },
		fetchWindowIcons: false,
	});
	return sources.map((s) => ({
		id: s.id,
		name: s.name,
		kind: s.id.startsWith("screen:") ? "screen" : "window",
		thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
	}));
}

function chooseSource(id) {
	chosenSourceId = typeof id === "string" ? id : null;
}

/** macOS privacy state, so the page can explain how to allow access. */
function permissionStatus() {
	if (process.platform !== "darwin") {
		return { microphone: "granted", camera: "granted", screen: "granted" };
	}
	return {
		microphone: systemPreferences.getMediaAccessStatus("microphone"),
		camera: systemPreferences.getMediaAccessStatus("camera"),
		screen: systemPreferences.getMediaAccessStatus("screen"),
	};
}

module.exports = { setupCapture, listSources, chooseSource, permissionStatus };
