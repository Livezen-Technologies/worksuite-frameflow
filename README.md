# Worksuite Video Editor

A free video editor from the Worksuite family (Worksuite OS, Cloud, Desktop, CMS) by Livezen Technologies.
It runs on macOS, Windows and Linux, and editing and export happen entirely on your device.

Based on [OpenCut](https://github.com/opencut-app/opencut-classic) (MIT). The original copyright notice is kept in [LICENSE](LICENSE).

## Download

Installers are built by the **Desktop Build** GitHub Actions workflow on every push:

| Platform | File |
| --- | --- |
| macOS (Apple Silicon and Intel) | `Worksuite-Video-Editor-<version>-mac-arm64.dmg`, `…-mac-x64.dmg` |
| Windows (x64) | `Worksuite-Video-Editor-<version>-win-x64-setup.exe` |
| Linux (x64) | `…-linux-x86_64.AppImage`, `…-linux-amd64.deb` |

Open the latest run under **Actions → Desktop Build** and download the artifact for your platform.
Pushing a tag such as `v1.0.0` also attaches the installers to a GitHub Release.

The builds are not code-signed yet:

- **macOS**: right-click the app, choose **Open**, then confirm.
- **Windows**: in SmartScreen, click **More info**, then **Run anyway**.

## Build locally

You need [Bun](https://bun.sh) 1.2.18 and Node.js 22.

```sh
# 1. Build the web editor (see .github/workflows/desktop-build.yml for the env vars it needs)
cd apps/web && bun install && bun run build

# 2. Package the desktop app
cd ../../electron
npm install
npm run prepare-web
npm run dist:linux   # or dist:mac / dist:win
```

Run `npm start` in `electron/` to open the app without packaging it.

## How it works

`electron/main.js` starts the bundled Next.js server from `apps/web` on a random `127.0.0.1` port and opens the editor in a window.
Projects are stored in the app's local IndexedDB. The cloud-backed parts of the upstream website (accounts, feedback, sound search) are offline in the desktop app.
Worksuite Cloud sign-in is specified in the SRS and is not implemented yet.
