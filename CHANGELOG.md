# Changelog

All notable changes to Worksuite FrameFlow are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

Every change merged into the project adds a line under **Unreleased**. `node scripts/release.mjs <patch|minor|major|x.y.z>` turns Unreleased into a numbered release and bumps the app version.

## [Unreleased]

### Added

- Transitions: 13 transitions in the Transitions tab: Cross dissolve, Dip to black, Blur dissolve, Slide, Push, Wipe, Split, Circle reveal, Iris diamond, Zoom in, Zoom out, Spin and Whip pan. Search, filter by category, and hover a tile to watch it. Set duration (0.1–3 s), easing, direction and alignment (centre, start or end on the cut), then apply to the selected cut, double-click a tile to apply it, or apply to every cut on the track. Clips with a transition show a ⇄ marker on the timeline. Transitions render in the preview and in exports.
- When a transition runs past the end of a clip, that clip holds its edge frame, and the panel says so.

- Color grading: the Color tab (Color workspace, Alt+2) grades the selected clip with Lift, Gamma, Gain and Offset wheels, each with a master; Exposure, Contrast, Temperature, Tint, Saturation, Vibrance, Highlights and Shadows sliders; and six built-in looks. Copy a grade and paste it to selected clips, apply it to all selected, hold to compare with the ungraded clip, and reset. Every setting is keyframeable and undoable. Double-click a wheel or slider to reset it.
- Scopes beside the grade: waveform, RGB parade, histogram and vectorscope with a skin-tone line, updated live from the preview.

- Editor workspaces: Edit, Color, Audio, Captions, Effects and Text layouts in a tab bar in the editor header. Switch with a click or Alt+1…Alt+9; playback, selection and undo history are kept. Save the current layout as a new workspace, rename or delete your own, and reset any workspace to its default. Each workspace remembers your last tweaks.
- Change team: switch between your personal account and Worksuite Cloud teams from the projects sidebar, the account menu, or Settings → Teams. Plan and cloud storage follow the chosen team, and the choice is remembered.

- Sinhala and Tamil in the auto-caption language list.
- Transcript-first captions: "Generate transcript" opens a transcript editor instead of writing captions straight to the timeline. Edit text, split at the cursor, merge, delete, jump the playhead to a segment, find and replace, and mark segments verified. "Build subtitles" unlocks once every segment is verified.
- Each segment is tagged Sinhala, English or mixed by script.
- Import and export transcripts as SRT, VTT, TXT (one line per segment) or JSON.
- Subtitles from a transcript follow broadcast limits: up to 2 lines of 42 characters, 1–7 seconds on screen. Lines are broken between words, never inside a Sinhala letter cluster.
- Noto Sans Sinhala (SIL OFL) is bundled, so Sinhala captions render offline.

### Changed

- Renamed the app to Worksuite FrameFlow (short name FrameFlow). The bundle ID is now `com.worksuitecloud.frameflow`, the Linux command `worksuite-frameflow`, and the Worksuite Cloud client ID `worksuite-frameflow`. It installs as a new app, so earlier test installs need to sign in again.

### Fixed

- The website footer credits OpenCut again; the rebrand had renamed the credit itself.

- macOS no longer says the app "is damaged and can't be opened": the Mac app is now ad-hoc code-signed after packaging, and the build checks the signature. (A first attempt left the app unsigned and failed that check.)

### Added

- Changelog and versioning: `CHANGELOG.md`, `scripts/release.mjs` and a CI check that each change updates this file.
- Full-screen welcome screen on first launch: create a Worksuite account, sign in, or continue without one.
- "Finish in your browser" screen while signing in, with a countdown, Copy sign-in link, Open browser again and Cancel.
- Settings page with Account & cloud (profile, plan, cloud storage, manage account, sign out) and About (app version, source code, OpenCut credit).
- Cloud storage meter in the projects sidebar when signed in.

### Changed

- New dark Worksuite look across the app, matching the "Worksuite Video Editor — Screens" designs. Dark is now the default theme and primary buttons are Worksuite blue.
- Projects page redesigned: Worksuite Video header with search and account, a sidebar, and a "Recent projects" title bar.

## [1.0.0] - 2026-10-22

### Added

- Desktop app for macOS, Windows and Linux, built on OpenCut (MIT) and runs offline.
- Installers: `.dmg` (Apple Silicon and Intel), Windows `-setup.exe`, Linux AppImage and `.deb`, built by the Desktop Build workflow.
- Worksuite Cloud sign-in: OIDC with PKCE in the system browser, refresh token encrypted with the OS keychain, account menu and first-run welcome screen.

### Changed

- Rebranded from OpenCut to Worksuite Video Editor: name, logo, app icon and links.

### Fixed

- Upstream build errors: outdated storage adapter and stickers registry calls, an orphaned keybindings module, and a Next.js config type clash.
