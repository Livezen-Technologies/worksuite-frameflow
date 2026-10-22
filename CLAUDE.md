# CLAUDE.md

See AGENTS.md for architecture.

## Changelog and version

- Every change adds a line to `CHANGELOG.md` under `## [Unreleased]`, in the right group (`Added`, `Changed`, `Fixed`, `Removed`, `Security`), written for users. Do this in the same commit as the change. CI fails a PR that doesn't touch `CHANGELOG.md`.
- The app version lives only in `electron/package.json`. Never edit it by hand; cut a release with `node scripts/release.mjs patch|minor|major`, which also dates the Unreleased notes. Tag `v<version>` to publish installers.
