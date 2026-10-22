# Worksuite FrameFlow

A free video editor from the Worksuite family (Worksuite OS, Cloud, Desktop, CMS) by Livezen Technologies.
It runs on macOS, Windows and Linux, and editing and export happen entirely on your device.

Based on [OpenCut](https://github.com/opencut-app/opencut-classic) (MIT). The original copyright notice is kept in [LICENSE](LICENSE).

## Download

Installers are built by the **Desktop Build** GitHub Actions workflow on every push:

| Platform | File |
| --- | --- |
| macOS (Apple Silicon and Intel) | `Worksuite-FrameFlow-<version>-mac-arm64.dmg`, `…-mac-x64.dmg` |
| Windows (x64) | `Worksuite-FrameFlow-<version>-win-x64-setup.exe` |
| Linux (x64) | `…-linux-x86_64.AppImage`, `…-linux-amd64.deb` |

Open the latest run under **Actions → Desktop Build** and download the artifact for your platform.
Pushing a tag such as `v1.0.0` also attaches the installers to a GitHub Release.

The builds are not code-signed yet:

- **macOS**: the app is ad-hoc signed but not notarised. Open it once, then go to **System Settings → Privacy & Security** and click **Open Anyway**. If macOS still says the app is damaged, run `xattr -cr "/Applications/Worksuite FrameFlow.app"` in Terminal.
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

## Worksuite Cloud sign-in

The desktop app signs in with Worksuite Cloud using OpenID Connect (Authorization Code + PKCE) in the system browser, with a one-time `127.0.0.1` redirect. An account is optional: editing and export always work without one.

- On first launch the app offers **Create Worksuite account**, **Sign in**, or **Continue without account**. After that, sign-in lives in the top-right of the projects page.
- The refresh token is encrypted with a key held in the OS keychain (Electron `safeStorage`). The access token stays in memory. Neither is ever passed to the web UI. On a Linux system with no keyring, the session lasts until the app quits.
- Sign-out revokes the refresh token at Worksuite Cloud and deletes local account data. Projects are not touched.

The identity server must provide:

| Setting | Default | Override |
| --- | --- | --- |
| Issuer (OIDC discovery) | `https://accounts.worksuitecloud.com` | `WSC_ISSUER` |
| Client ID (public, no secret) | `worksuite-frameflow` | `WSC_CLIENT_ID` |
| API (`GET /v1/me`) | `https://api.worksuitecloud.com` | `WSC_API_BASE` |
| Manage account page | `https://worksuitecloud.com/account` | `WSC_MANAGE_URL` |

The client must allow loopback redirect URIs (`http://127.0.0.1:<any port>/callback`) and the `authorization_code` and `refresh_token` grants. Sign-up opens with `prompt=create`. Until `/v1/me` exists, the profile comes from the OIDC userinfo endpoint.

## Changelog and releases

Changes are listed in [CHANGELOG.md](CHANGELOG.md). Every change adds a line under **Unreleased**, and CI fails a pull request that doesn't (label it `skip-changelog` for changes with nothing user-facing).

To release, run `node scripts/release.mjs patch` (or `minor`, `major`, or an exact `x.y.z`). It moves the Unreleased notes under the new version and sets the app version in `electron/package.json`. Then commit and push a `v<version>` tag; the Desktop Build workflow attaches the installers to a GitHub Release.
