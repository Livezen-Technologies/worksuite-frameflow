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

You need [Bun](https://bun.sh) 1.2.18, Node.js 22, and Rust with the `wasm32-unknown-unknown` target plus `wasm-bindgen-cli` 0.2.116 (`cargo install wasm-bindgen-cli --version 0.2.116`).

```sh
# 0. Build the engine (Rust → WebAssembly) into rust/wasm/pkg
./scripts/build-wasm.sh

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

The video engine (compositor, effects, color grading) is Rust in `rust/`, compiled to WebAssembly by `scripts/build-wasm.sh`; the web app imports it as `opencut-wasm` from `rust/wasm/pkg`. After changing Rust code, rebuild it and run `bun install` in `apps/web` again so the app picks up the new build.


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

`/v1/me` may list workspaces as `workspaces: [{ id, name, type: "personal" | "team", role, plan, storage_quota, storage_used }]` with an optional `active_workspace_id`. When it lists more than one, FrameFlow shows a workspace switcher and remembers the choice on the device.

## Changelog and releases

Changes are listed in [CHANGELOG.md](CHANGELOG.md). Every change adds a line under **Unreleased**, and CI fails a pull request that doesn't (label it `skip-changelog` for changes with nothing user-facing).

To release, run `node scripts/release.mjs patch` (or `minor`, `major`, or an exact `x.y.z`). It moves the Unreleased notes under the new version and sets the app version in `electron/package.json`. Then commit and push a `v<version>` tag; the Desktop Build workflow attaches the installers to a GitHub Release.

## Auto-update and the download center

The desktop app updates from the Worksuite download center. Each channel is a folder:

```
https://download.worksuitecloud.com/frameflow/<stable|beta>/
  latest.yml        Windows feed      Worksuite-FrameFlow-<v>-win-x64-setup.exe (+ .blockmap)
  latest-linux.yml  Linux feed        Worksuite-FrameFlow-<v>-linux-x86_64.AppImage, .deb
  latest-mac.yml    macOS feed        Worksuite-FrameFlow-<v>-mac-<arch>.zip / .dmg
```

- Windows (NSIS) and Linux AppImage download updates in the background and install on restart.
- macOS builds are ad-hoc signed, so they can't replace themselves. They show the new version and open the download page (`WSC_DOWNLOAD_PAGE`). The same applies to `.deb` installs. Self-updating on macOS needs a Developer ID certificate.
- Users choose Stable or Beta and turn automatic checks on or off in Settings › Updates.
- Release tags publish installers and feeds there from CI when these repository secrets are set: `DOWNLOAD_CENTER_BUCKET`, `DOWNLOAD_CENTER_ENDPOINT` (S3/R2 endpoint), `DOWNLOAD_CENTER_KEY_ID` and `DOWNLOAD_CENTER_SECRET`. Tags containing `-beta` go to the beta channel. Feeds are uploaded after the installers.
- `WSC_UPDATE_URL` overrides the feed base URL, for testing.

## Asset library and the download center

The Asset Library (editor header → **Assets**, or the links in Animations and Sounds) lists packs of motion graphics, text and video templates, sounds, transitions, effects, filters, colour profiles, LUTs and fonts from the Worksuite download center, next to the built-in packs that ship with the app (shown as *Installed (built-in)* and usable offline).

**Layout.** Packs live in `assets/packs/<type>/<pack-id>/` with a `pack.json` (id, type, semver version, title, description, tags in `en`/`si`/`ta`, languages, licence, minAppVersion, plan `free|pro`). A pack's files sit beside `pack.json`, or `source` picks them from the bundled Worksuite pack: `motion/worksuite-essentials`, `motion/subscribe-buttons` and `sounds/worksuite-sfx` are carved out of `assets/worksuite-pack` this way, so the bundled copy in `apps/web/public/worksuite-pack` and every existing asset id keep working. Motion packs carry an `index.json` in the Worksuite pack format; sound packs list `sounds`, font packs `fonts`, other types `items`.

**Catalog.** `node scripts/assets/build-catalog.mjs [--channel stable|beta] [--out dist/assets]` zips each pack (deterministic bytes), writes `catalog.json` (schema: `assets/packs/catalog.schema.json`; per pack: size, sha256, `files` zip URL, thumbnail) and `catalog.json.sig`, the base64 Ed25519 signature of `catalog.json` made with the PEM private key in `ASSET_SIGNING_KEY`. Use `--unsigned` for local builds and `--validate` to check pack folders only.

**In the app.** `electron/asset-store.js` fetches `<ASSET_BASE>/<channel>/catalog.json` (ETag-cached; offline it uses the cached copy), and trusts it only if the signature verifies against the public key embedded in that file. Packs download with progress, pause/resume (HTTP Range) and cancel; the zip's SHA-256 must match the catalog and its `pack.json` the catalog entry, and unpacking rejects absolute paths, `..`, symlinks, encryption and zip64. Installed packs live in `<userData>/assets/<packId>/<version>/` and the page reads them only through `wsc-asset://<packId>/<version>/<file>`. Projects store pack assets as `packId@version/assetId`; a newer installed version satisfies older references and Motion Editor overrides carry over.

**Publishing.** Push a tag `assets-v<anything>` (`-beta` in the tag publishes to the beta channel). The *Asset packs* workflow validates the packs, builds and signs the catalog, and uploads `packs/` first and `catalog.json` last (`no-cache`) to `s3://$DOWNLOAD_CENTER_BUCKET/assets/<channel>/` with the `DOWNLOAD_CENTER_*` secrets. Without the secrets or `ASSET_SIGNING_KEY` it builds and attaches the catalog as an artifact and skips publishing. Pull requests that touch assets run the same validation.

**Signing key.** Generate a pair with `node -e 'const c=require("crypto");const k=c.generateKeyPairSync("ed25519");console.log(k.privateKey.export({type:"pkcs8",format:"pem"}));console.log(k.publicKey.export({type:"spki",format:"pem"}))'`, store the private key as the `ASSET_SIGNING_KEY` secret and put the public key in `CATALOG_PUBLIC_KEY` in `electron/asset-store.js`.

**Environment overrides.** `WSC_ASSET_URL` (default `https://download.worksuitecloud.com/assets`) points the app at another download center; `WSC_ASSET_PUBLIC_KEY` replaces the embedded public key (for a dev catalog signed with your own key).

**Motion Editor.** Pack animations can declare `textSlots` and `imageSlots` in `asset.json` (layers named `slot:text:<id>` / `slot:image:<id>`). Changing a slot's words draws live text (Canvas 2D, bundled Noto Sinhala/Tamil fonts) that follows the layer and fits its box, with the authored outlines as the fallback; a picture in an image slot (such as a channel photo in `sub-avatar-bar`'s avatar) is clipped to the slot's shape and follows its animation. The validator checks every slot names a real layer.
