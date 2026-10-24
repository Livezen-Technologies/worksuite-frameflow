// Recording privacy (SRS SC-08): open window titles for the protected-window
// watch, and a Do not disturb switch for the length of a take.
const { desktopCapturer, screen } = require("electron");
const { execFile } = require("node:child_process");

async function windowNames() {
	const sources = await desktopCapturer.getSources({
		types: ["window"],
		thumbnailSize: { width: 0, height: 0 },
		fetchWindowIcons: false,
	});
	return sources.map((s) => s.name);
}

const run = (cmd, args) =>
	new Promise((resolve) => execFile(cmd, args, { timeout: 4000 }, (error, stdout) => resolve(error ? null : String(stdout).trim())));

// What the system was set to before we turned notifications off, to put back.
let saved = null;

const platforms = {
	linux: {
		async read() {
			return run("gsettings", ["get", "org.gnome.desktop.notifications", "show-banners"]);
		},
		async write(value) {
			return (await run("gsettings", ["set", "org.gnome.desktop.notifications", "show-banners", value])) !== null;
		},
		off: "false",
	},
	win32: {
		key: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications",
		async read() {
			const out = await run("reg", ["query", this.key, "/v", "ToastEnabled"]);
			const match = out?.match(/0x([0-9a-f]+)/i);
			return match ? String(Number.parseInt(match[1], 16)) : "1";
		},
		async write(value) {
			return (await run("reg", ["add", this.key, "/v", "ToastEnabled", "/t", "REG_DWORD", "/d", value, "/f"])) !== null;
		},
		off: "0",
	},
};

/** Returns whether notifications are now held back; macOS has no public switch for Focus. */
async function doNotDisturb(on) {
	const p = platforms[process.platform];
	if (!p) return { ok: false, reason: "unsupported" };
	if (on) {
		if (saved === null) saved = await p.read();
		if (saved === null) return { ok: false, reason: "unavailable" };
		return { ok: await p.write(p.off) };
	}
	if (saved === null) return { ok: true };
	const ok = await p.write(saved);
	saved = null;
	return { ok };
}

// ---------- private window positions (CT-R4) ----------

const WIN_SCRIPT = `
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class WsWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct RECT { public int L, T, R, B; }
}
"@
[WsWin]::SetProcessDPIAware() | Out-Null
$out = New-Object System.Collections.ArrayList
[WsWin]::EnumWindows({ param($h, $l)
  if ([WsWin]::IsWindowVisible($h) -and -not [WsWin]::IsIconic($h)) {
    $sb = New-Object System.Text.StringBuilder 256
    [WsWin]::GetWindowText($h, $sb, 256) | Out-Null
    $t = $sb.ToString()
    if ($t) { $r = New-Object WsWin+RECT; [WsWin]::GetWindowRect($h, [ref]$r) | Out-Null; [void]$out.Add("$($r.L)|$($r.T)|$($r.R - $r.L)|$($r.B - $r.T)|$t") }
  }
  return $true }, [IntPtr]::Zero) | Out-Null
$out -join [char]10
`;

const MAC_SCRIPT = `
ObjC.import('CoreGraphics');
const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, 0)));
list.filter(w => w.kCGWindowLayer === 0).map(w => [w.kCGWindowBounds.X, w.kCGWindowBounds.Y, w.kCGWindowBounds.Width, w.kCGWindowBounds.Height, (w.kCGWindowOwnerName || '') + ' ' + (w.kCGWindowName || '')].join('|')).join('\\n');
`;

/** Every visible window as { name, x, y, width, height } in screen points (DIP). */
async function windowList() {
	let text = null;
	let scale = 1;
	if (process.platform === "win32") {
		text = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WIN_SCRIPT]);
		// The script reads physical pixels; Electron places windows in DIP.
		scale = screen.getPrimaryDisplay().scaleFactor || 1;
	} else if (process.platform === "darwin") {
		text = await run("osascript", ["-l", "JavaScript", "-e", MAC_SCRIPT]);
	} else {
		text = await linuxWindows();
	}
	if (!text) return [];
	return text
		.split("\n")
		.map((line) => {
			const [x, y, w, h, ...name] = line.split("|");
			return { name: name.join("|").trim(), x: Number(x) / scale, y: Number(y) / scale, width: Number(w) / scale, height: Number(h) / scale };
		})
		.filter((w) => w.name && w.width > 20 && w.height > 20 && [w.x, w.y].every(Number.isFinite));
}

/** X11: wmctrl when installed, else xwininfo. Wayland hides other windows' positions. */
async function linuxWindows() {
	const wm = await run("wmctrl", ["-lG"]);
	if (wm !== null) {
		return wm
			.split("\n")
			.map((l) => /^\S+\s+-?\d+\s+(-?\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)\s+\S+\s+(.*)$/.exec(l))
			.filter(Boolean)
			.map((m) => `${m[1]}|${m[2]}|${m[3]}|${m[4]}|${m[5]}`)
			.join("\n");
	}
	const tree = await run("xwininfo", ["-root", "-tree"]);
	if (tree === null) return xdotoolWindows();
	return tree
		.split("\n")
		.map((l) => /"([^"]+)":.*?\s(\d+)x(\d+)\+-?\d+\+-?\d+\s+\+(-?\d+)\+(-?\d+)/.exec(l))
		.filter(Boolean)
		.map((m) => `${m[4]}|${m[5]}|${m[2]}|${m[3]}|${m[1]}`)
		.join("\n");
}

async function xdotoolWindows() {
	const ids = await run("xdotool", ["search", "--onlyvisible", "--name", "."]);
	if (ids === null) return null;
	const rows = await Promise.all(
		ids.split("\n").filter(Boolean).slice(0, 80).map(async (id) => {
			const out = await run("xdotool", ["getwindowname", id, "getwindowgeometry", "--shell", id]);
			if (!out) return null;
			const [name, ...rest] = out.split("\n");
			const v = Object.fromEntries(rest.map((l) => l.split("=")));
			return `${v.X}|${v.Y}|${v.WIDTH}|${v.HEIGHT}|${name}`;
		}),
	);
	return rows.filter(Boolean).join("\n");
}

/** Positions of open windows whose name contains one of the patterns. */
async function privateWindows(patterns) {
	const wanted = (patterns ?? []).map((p) => String(p).trim().toLowerCase()).filter(Boolean);
	if (!wanted.length) return [];
	return (await windowList()).filter((w) => wanted.some((p) => w.name.toLowerCase().includes(p)));
}

module.exports = { windowNames, doNotDisturb, windowList, privateWindows };
