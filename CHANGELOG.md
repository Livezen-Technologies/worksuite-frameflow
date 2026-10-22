# Changelog

All notable changes to Worksuite Video Editor are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

Every change merged into the project adds a line under **Unreleased**. `node scripts/release.mjs <patch|minor|major|x.y.z>` turns Unreleased into a numbered release and bumps the app version.

## [Unreleased]

### Added

- Changelog and versioning: `CHANGELOG.md`, `scripts/release.mjs` and a CI check that each change updates this file.

## [1.0.0] - 2026-10-22

### Added

- Desktop app for macOS, Windows and Linux, built on OpenCut (MIT) and runs offline.
- Installers: `.dmg` (Apple Silicon and Intel), Windows `-setup.exe`, Linux AppImage and `.deb`, built by the Desktop Build workflow.
- Worksuite Cloud sign-in: OIDC with PKCE in the system browser, refresh token encrypted with the OS keychain, account menu and first-run welcome screen.

### Changed

- Rebranded from OpenCut to Worksuite Video Editor: name, logo, app icon and links.

### Fixed

- Upstream build errors: outdated storage adapter and stickers registry calls, an orphaned keybindings module, and a Next.js config type clash.
