# Changelog

All notable changes to Worksuite FrameFlow are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

Every change merged into the project adds a line under **Unreleased**. `node scripts/release.mjs <patch|minor|major|x.y.z>` turns Unreleased into a numbered release and bumps the app version.

## [Unreleased]

### Added
- Automatic updates from the Worksuite download center. Windows and Linux (AppImage) download new versions in the background and offer "Restart to update". macOS and .deb builds show the new version and open the download center. Settings › Updates has Check for updates, a Stable or Beta channel, and automatic checks you can turn off.
- LUTs in the Color workspace.
  - Import .cube 3D LUTs one by one, as a ZIP, or as a folder. They run on the GPU with smooth (trilinear) interpolation.
  - Camera LUT library for DJI (Mavic/Air/Mini, Avata, Osmo Action, Osmo Pocket, Ronin), GoPro and Insta360, with D-Log, D-Log M, HLG, GP-Log, Protune Flat and I-Log profiles. Imported vendor LUTs are filed under the right camera from their file name.
  - A camera LUT is applied before your grade and filters, with an intensity slider, per clip or for all clips from the same camera.
  - FrameFlow recognises DJI, GoPro and Insta360 footage when you import it. If the colour profile isn't in the file, it asks once per camera and remembers.
  - An option applies the matching LUT automatically.
  - "Get official LUTs" links go to each maker's download page. FrameFlow doesn't include vendor LUT files.
- Brand kit sidebar: keep your brand's name, logos (up to 6), colours and heading/body fonts on this computer, ready in every project.
  - Add a logo as a watermark across the whole video: choose the corner, size and opacity.
  - Add a heading, body text or a lower third already in your brand fonts and colours.
  - Click a brand colour to recolour selected text and shapes.
  - Apply the brand fonts to selected text in one click.
- Filters sidebar: 19 one-click looks for video and photo clips, in six groups: Portrait, Vivid, Film, Cinematic, Mono and Mood. Examples include Soft Skin, Ceylon Tea, Kodak 200, Teal & Orange, B&W Classic and Night Blue. Each tile previews the look. A strength slider fades a filter in or out, and None removes it. Filters apply to every selected clip in one step and stay editable in the clip's Effects tab.
- Elements sidebar: 30 ready-styled elements you add at the playhead with one click.
  - Shapes: rectangle, rounded, circle, ring, triangle, hexagon, star, burst, heart
  - Lines & arrows: arrows, lines, dashed line, animated underline
  - Callouts: speech bubbles and a note
  - Badges: NEW, SALE, LIVE, SUBSCRIBE, අලුත්, Follow
  - Overlays: light leaks, colour wash, vignette, bottom fade, frame borders
  - Stickers: the existing flags and shapes
  New shape types (arrow, line, speech bubble, heart, gradient, frame) can be edited in Properties like the other shapes.
- Templates sidebar: 8 ready-made video templates — Cinematic Intro, Travel Slideshow, Reel Hook (9:16), Product Promo (1:1), a Sinhala New Year greeting, Podcast Quote, YouTube End Screen and Business Announcement. Browse by category or search, with animated previews. "Use template" builds it at the playhead from your imported photos and videos (cropped to fill the frame), with titles, shapes, animations and transitions, and can switch the project to the template's shape. Without media, coloured cards hold the slots. It's one undo step.
- Animation panel for video, image, sticker, graphic and text clips: In, Out and Combo tabs with live preview tiles. In and Out include fade, slides in four directions, zoom, pop, bounce, spin and drop (plus typewriter for text). Combo animations run for the whole clip: pulse, float, wobble, slow zoom, swing and heartbeat. Duration or speed is set with one slider.
- Team sharing: in a team workspace, open the cloud button on a synced project and choose "Share with team…" to give teammates "Can view" or "Can edit" access, or take it away. Shared projects show who shared them and your access in the project list. Editors sync like the owner. Viewers get the owner's updates, but their own changes stay on their device, with an option to discard them and get the latest.
- Cloud project sync: turn on "Sync to Worksuite Cloud" from the cloud button in the editor. The project and its media upload in the background, edits sync every few seconds, and newer versions from your other devices download automatically. The project list marks projects as Local or Local + Cloud and lists cloud projects you can download and open. If a project was changed on two devices, both versions are kept and you can open the other one.
- Share links: when signed in to Worksuite, tick "Upload to Worksuite Cloud and create a share link" in the Export window. The video uploads in parts, with progress and a cancel button. Choose when the link expires (1, 7 or 30 days, or never) and whether viewers may download, then copy the link. Failed parts are retried, and a stopped upload resumes where it left off, even after restarting the app.
- New Export window: presets (Project, YouTube 1080p, TikTok / Reels, 4K master, Custom size), frame rate, codec (H.264, HEVC, AV1, VP9 — ones your computer can't encode are greyed out), quality, and an estimated file size. A different shape from the project is letterboxed.
- Export subtitles: burn captions in or leave them out, add them as a subtitle track inside the video, and save a UTF-8 .srt file beside it.
- The desktop app saves exports with a normal Save dialog, starting in Videos/Worksuite, and offers "Show in folder" when done.
- Text templates (Text workspace): 10 ready-made styles, including Sinhala, neon, lower third, poster and subscribe badge. Search and filter them by category, add one at the playhead, apply a template's style to selected text or caption clips, and save your own under My templates.
- Text stroke, shadow and glow, plus in/out animations: fade, slide, pop, bounce and a typewriter that reveals Sinhala letter by letter without breaking characters.

- 13 new effects, rendered on the GPU: Sharpen; Vignette, Posterize, Invert, Edge detect; Pixelate, Mirror, Wave; Glow; Film grain, VHS, RGB split and Sepia. Film grain, VHS and Wave move over time.
- Effects browser: categories (Blur, Stylise, Distort, Light, Retro, Color), search, favourites (star an effect), and double-click to add an effect to the selected clips. Dragging onto a clip or an empty track works as before.
- Effect stack presets: "Save stack as preset" in a clip's Effects tab, then apply it to other clips from Effects → My presets.

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
- New look for the editor: a labelled tool sidebar (Media, Audio, Text, Elements, Effects, Transitions, Captions, Color, Settings) and a matching labelled tab rail in the properties panel. The timeline toolbar gets a centred play button with current and total time, and circular zoom buttons. Selected clips get a cyan outline with grip handles.
- A cleaner, modern Export button.

- Renamed the app to Worksuite FrameFlow (short name FrameFlow). The bundle ID is now `com.worksuitecloud.frameflow`, the Linux command `worksuite-frameflow`, and the Worksuite Cloud client ID `worksuite-frameflow`. It installs as a new app, so earlier test installs need to sign in again.

### Fixed
- Clicking the workspace you're already in now brings its tool panel back.
- Projects, media and settings are no longer lost when the desktop app is restarted. The app now always starts on the same local address.

- On computers without WebGPU (WebGL fallback), opening the Effects panel could leave the preview showing an effect thumbnail or a zoomed-in corner of the frame, because thumbnails and the preview share one canvas. The preview now restores its canvas and redraws.
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
