# Changelog

All notable changes to Worksuite FrameFlow are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

Every change merged into the project adds a line under **Unreleased**. `node scripts/release.mjs <patch|minor|major|x.y.z>` turns Unreleased into a numbered release and bumps the app version.

## [Unreleased]

### Added
- Automation API: turn it on in Settings → API to control the editor from scripts with the new `wve` command (create and open projects, import media, add clips and titles, export, sign in and sync) or from AI agents through `wve mcp`. Only programs running as your user can connect, and none of them see your sign-in or API keys.
- AI features with Google Gemini, using your own API key (Settings → AI, stored encrypted on this computer): cloud transcription as a second engine in Captions, Translate and Clean up text in the transcript editor (with Undo), and a vocabulary list of names and terms AI should spell exactly.
- Projects can be saved as a portable folder (`.ffproj`) with all their media copied in, so they open on any computer. Use Save as project folder in the project menu; edits save to the folder automatically. Open folder on the Projects page brings one back, and asks you to find any media that's missing.
- The interface can now be shown in Sinhala or Tamil. Pick a language under Settings → Project info; it follows your system language the first time and syncs with your other settings.
- Curves and HSL in the Color panel (Curves & HSL effect).
  - Curves: luma, red, green and blue, plus hue vs hue and hue vs saturation. Click to add a point, drag it, and double-click to remove it.
  - HSL qualifier: pick a colour by hue, saturation and luminance range with softness, invert, or show the selection in black and white. Then shift its hue, saturation and lightness, for example skin tones or a sky.
- HDR projects (Rec. 2100 HLG or PQ/HDR10), set in Project settings or with "Make HDR project" when you import HDR footage.
  - HDR clips keep their highlights, while SDR clips, photos, titles and captions sit at graphics white (203 nits by default, adjustable).
  - On SDR screens the preview is tone-mapped and labelled.
  - Exports are 10-bit VP9 Profile 2 WebM with BT.2020 and HLG or PQ signalling. Choose SDR (tone-mapped) instead, or tick "Also save an SDR version" to get both from one click.

- HDR video support in SDR projects:
  - HLG and PQ (HDR10) clips are detected on import and badged "HDR · HLG" or "HDR · PQ" in the media bin.
  - They are tone-mapped to SDR by the editor itself rather than by the browser. Reference white lands on SDR white, highlights roll off instead of clipping, and BT.2020 colour is mapped to Rec. 709. Preview, thumbnails and export all use this.
  - Each clip's Basic tab has an HDR section: colour-source override (Auto, SDR, HLG, PQ) plus exposure, highlight roll-off and saturation. Project-wide defaults are in Project settings.
  - The preview shows a "Previewing tone-mapped" label.
- Social template packs for YouTube, Facebook, TikTok and Podcast: 12 animated templates each, in English, Sinhala and mixed versions. Find them in Text → Packs.
  - Templates are laid out inside each platform's safe area and adapt to every shape the pack supports (16:9, 9:16, 1:1, 4:5). The matching safe-area guide turns on while you place a vertical template.
  - "Your details" fills in names, channel, handle, episode and more; the brand kit name is used for the channel. Chapter titles can be added at every bookmark.
  - Brand kit option to recolour with your colours and fonts.
  - Favourites, search and purpose filters.
  - "Use the whole pack" adds the intro, lower third, call to action and ending as one undo step.
- Templates carry no platform logos.
- HEIC/HEIF photo import (.heic, .heif, .hif) from the Import button and drag and drop.
  - Photos are decoded off the editor thread, including iPhone tiled images, rotation and mirroring.
  - Photos with transparency stay transparent. For files holding several pictures, the main one is imported.
  - When a Live Photo is imported together with its .mov, you choose the video clip or the photo.
  - Damaged files show a clear message.
  - The libheif decoder (LGPL-3.0) ships with its licence.
- Project settings: open from the W menu or the project switcher. Saving applies everything as one undo step.
  - Details: name, aspect ratio (including Original, from the first clip), resolution 720p–8K or custom, frame rate (23.976–60), colour space (Rec. 709/2020 SDR), audio sample rate and channels (used for export), and 360° project.
  - When the frame changes, existing clips can scale to fit, scale to fill, or keep their size.
  - Defaults per project: still image length, transition length, caption language, typing language, and export preset.
  - Settings templates: built-in YouTube, TikTok and Instagram templates, plus Save as template. Start a new project from a template with the arrow next to New project.
- Add cover: pick a frame from the video on a filmstrip, or upload a picture. The cover becomes the project thumbnail and can be the first frame of the export. Open it from Cover in the timeline toolbar.
- Export: Video and GIF tabs.
  - Video adds sliders for resolution (480p–4K), frame rate (24–60) and bitrate (5–100 Mbps), with a recommended bitrate and the estimated file size.
  - GIF exports at 240p–720p and 10–30 fps.
- Sinhala and Tamil typing in every text field, with no OS keyboard needed. The EN / සිං / த button in the editor header switches language, as does Ctrl/Cmd+Shift+L.
  - Singlish: type as it sounds (ayubowan → ආයුබෝවන්), including yansaya, rakaransaya and repaya. A Wijesekara layout is also available.
  - Tamil phonetic typing (vanakkam → வணக்கம்).
  - Suggestions appear as you type, ranked from a built-in offline word list. Pick one with the number or arrow keys; Space accepts the first. Your picks are learned and synced with your account.
  - Shift+Space or `backticks` keep a word in English.
  - An on-screen Sinhala and Tamil keyboard.
- Legacy Sinhala fonts (FM, DL): text stays Unicode while you edit and is converted automatically when drawn.
  - Pasting FM-encoded text converts it to Unicode, with Undo.
  - The text panel adds Copy as legacy text, Singlish → සිංහල and Add romanised line.
- Several open projects at once, switched from a menu next to the project name.
  - The menu lists each project with its Local or Cloud status and shortcut, with a check on the current one. Drag to reorder.
  - Shortcuts: Ctrl/Cmd+Tab and Ctrl/Cmd+1–9 switch, Ctrl/Cmd+W closes, and Ctrl/Cmd+Shift+T reopens the last closed project.
  - Each tab keeps its own undo history, playhead and selection.
  - On the next start, Home offers to reopen the projects from last time.
- Copy and paste between projects: clips pasted into another project bring their media into its Media bin.
- Paste attributes (Ctrl/Cmd+Alt+V): choose what to copy from a clip onto the selected clips (effects, colour grade and LUTs, transform, speed, volume, text style, animations, keyframes), in one undo step.

### Removed
- Platform guide icons no longer load logos from Brandfetch; they show a plain letter instead.

### Fixed
- A project started at a chosen size (custom size or a size template) no longer switches to the size of the first photo or video you add.
- Adjustment-layer effects no longer fail to reach the renderer (a field name mismatch with the engine).
- Undo no longer reaches into a project you had open before.
- Videos from other cameras are no longer mistaken for DJI footage.
- New text panel with Presets, Basic, Animation and Motion tracking tabs.
  - **Presets:** 16 Styles (outline, highlight, neon, comic, fire, gold and more) and the Templates, each with Apply to all.
  - **Basic:** the words, font, a format bar (size, bold, italic, underline, alignment, letter case, line and letter spacing), Fill, Stroke, Background and Shadow (each with its own settings), Glow, Opacity and Transform, with Apply to all.
  - **Animation:** text gets a Loop tab (the Combo animations plus Shake, Breathe, Blink and Flicker) and a Caption tab: Word by word, Quick words, Line by line and Letter by letter.
  - **Motion tracking:** text follows an object in the video under it from the playhead on, as position keyframes you can adjust.
- Dual screen: the preview, media panel, timeline and properties can each move to their own window (hover a panel and click the window button in its corner), for example to put the preview on a second monitor. The windows stay on the same project: playback, selection, menus and keyboard shortcuts work in all of them. "Bring it back" or closing the window returns the panel.
- Basic tab for video and image clips. It has Mask and Color adjustment shortcuts, Blend (mode and opacity), Transform, and three switches:
  - Stabilize smooths camera shake with position keyframes and a 10% zoom.
  - Reduce image noise adds an edge-preserving GPU denoise.
  - Remove flicker evens out brightness with exposure keyframes.
  - Stabilize and Remove flicker analyse the clip and write ordinary keyframes, so the result stays editable.

### Changed
- The app's description and copyright line no longer say "Based on OpenCut". OpenCut's MIT licence ships with the app in licenses/OpenCut-LICENSE.txt.
- Speed has Normal and Curve tabs. Normal sets speed, duration and pitch. Curve adds speed ramps: Montage, Hero, Bullet, Jump Cut, Flash In, Flash Out, or Custom (five points). The clip is played in 16 short pieces at changing speeds, in one undo step, and None turns it back into one clip.
- Clip toolbar over the selected clip in the preview: Replace, Fit/Fill, Crop, Overlay track, and a "…" menu with Copy, Cut, Paste, Duplicate, Delete, Replace, Crop, Flip (horizontal or vertical), Overlay and Add overlay.
- Aspect-ratio picker at the top-left of the preview: original aspect ratio, 16:9, 4:3, 2:1, 9:16, 1:1, 3:4 and 4:5, each labelled with where it's used.
- More in the timeline clip menu: Cut, Paste, Replace (keeps the clip's place and length), Download clip (original file or the frame at the playhead), Transcript-based editing, Split scene (cuts the clip at every shot change) and Freeze (holds the frame at the playhead for 3 seconds and moves the rest of the track along). Each is one undo step.
- Offline mode (Settings › Network & sync) stops all network traffic from FrameFlow: cloud sync, sharing, sign-in, fonts and sound search. Update checks still run unless you turn them off. An "Offline" badge in the header turns it off again. Cloud features are hidden while offline or signed out.
- Upload queue in the header: every cloud upload (project media, share links, library items) with its progress, pause and resume, and pause/resume all. A paused or interrupted upload carries on from its last finished part. Settings has an upload speed limit.
- Settings sync: keyboard shortcuts, effect presets, title templates, workspaces, the brand kit, timeline and preview preferences, and camera-LUT choices follow your Worksuite account, setting by setting, newest change wins. It can be turned off or run now from Settings.
- Cloud asset library in the Media bin: "My library" and "Team library" folders of logos, intros, music and LUTs. Add files from any project and use them in any project on any computer. LUTs go straight into your LUT library.
- 360° video.
  - 360° videos are recognised on import, from their 360° metadata or their 2:1 shape, and get a "360°" badge. Any clip can be marked "This is 360°" by hand.
  - Reframe a 360° clip into normal video with a virtual camera: pan, tilt, roll, field of view and lens, all keyframeable. Drag the preview to aim and scroll to zoom. "Keyframe view" saves the current view in one click, and pans take the short way round.
  - Projection styles: Natural, Wide, Tiny planet and Rabbit hole. The lens setting blends between them, so they can animate into each other. Effects, text and captions apply to the reframed picture, at any output size.
  - 360° projects (4K, 5.7K or 8K, 2:1). Clips stay 360° and can be turned to set which way is front. The preview has a look-around view, plus horizon and front guides.
  - 360° exports carry 360° metadata (Spherical Video V1 and V2), so YouTube, Facebook and VR headsets play them as 360°. Export presets: YouTube 360 5.7K and 4K, Facebook 360, VR headset.
  - Insta360 .insv and GoPro MAX .360 originals get a message explaining how to export them as 360° MP4 first.
- Record sidebar: record a voiceover, your screen, screen + camera, or your camera, straight onto the timeline.
  - Voiceovers start at the playhead while the video plays (timeline muted by default). They are saved as 48 kHz WAV, mono or stereo, and placed on a free audio track, lined up with the picture.
  - Screen recordings: pick a display or window, at 1080p 30, 1440p 60 or 4K 60, with optional system audio on Windows and Linux. The camera lands on its own track as a picture-in-picture you can move or resize, and the mic on its own audio track.
  - Countdown (off, 3, 5 or 10 s), a live level meter with a clipping warning, pause and resume, markers (M) that become timeline bookmarks, and Esc to discard.
  - Takes are saved every second. If the app closes mid-take, the Record sidebar offers to recover it.
  - Shows how much space a minute of recording takes and warns when less than 10 minutes are left. If a mic, camera or screen share drops out, the take pauses.
  - Your choices of microphone, camera, quality and countdown are remembered. If access is blocked, FrameFlow says where to allow it in system settings. Only FrameFlow's own pages may use the camera, mic or screen.
- Transcript sidebar: the transcript sits beside the video.
  - The current line is highlighted as it plays. Click a line to jump there, double-click to edit it, or search.
  - "Cut from video" removes that line's stretch from every track and closes the gap. One undo (Ctrl+Z) restores the video and the line.
  - Start from a transcription, from the captions already on the timeline, or by importing SRT, VTT, ASS or JSON.
  - "Add as captions" turns the transcript into captions.
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
