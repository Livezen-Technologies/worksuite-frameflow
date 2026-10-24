# Changelog

All notable changes to Worksuite FrameFlow are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

Every change merged into the project adds a line under **Unreleased**. `node scripts/release.mjs <patch|minor|major|x.y.z>` turns Unreleased into a numbered release and bumps the app version.

## [Unreleased]

### Added

- **Music & Audio Editor**: a studio for music and sound, opened from **Music & Audio Editor** in the home sidebar or the new **Video | Audio** switch in the editor's header. It edits the same project, so every change is on the video timeline at once and you can switch back and forth freely. It has audio tracks with mute, solo and remove, import at the playhead, a live **beat visualizer** and **output meter** (level and peak), the multi-track timeline with waveforms (trim, split, move, duplicate, delete, undo and redo), one-click Fade and **Normalize**, and an inspector with **Process** (AI voice clean-up, remove silences, set loudness to about −16 LUFS, normalize peaks), a **3-band EQ with low cut** and presets (Podcast voice, Warm, Bright, Bass boost, Radio, Telephone, Soft highs), Volume and fades, the voice changer and Speed. The EQ is heard in the preview and the export. A transport bar has play, stop, start and end.
- **Tools in the home sidebar** (desktop): **Screen recorder**, **Video converter** and **Video downloader**. The converter turns videos and audio into MP4, MOV, WebM, GIF, MP3, M4A or WAV at the original size, 4K, 1080p, 720p or 480p and three quality levels (drop several files at once); results go to Videos › Worksuite and appear under Exports. The downloader saves videos from direct links: a link to the file itself, or a page that publishes its video file. Files go to Downloads › Worksuite. Both can open the result in the editor with one click.
- **Motion tracking for pictures, stickers and graphics**, not just text: a new Motion tracking tab makes them follow an object in the video below. The panel has a clearer how-to picture and steps.
- **26 more clip animations** in Animation › In, Out and Combo, with live previews on the tiles: Blur In/Out, Zoom Blur, Crystal Ball and Closing (round reveal), Diamond, Wipe Right/Left/Down/Up, Shutter, Curtain, Flip, Twist, Flash Cuts, Swing In and Fall, plus Combo loops Rock, Spin, Bounce, Drift, Dream Blur and Spotlight. They play in the preview and in exports.
- **Video and image clip panels, CapCut-style**: a **Background** tab (colour, blur or pattern behind the clip), Animation and Speed right after Basic, and a **Voice changer** tab for clips with sound. **Speed** gets a slider (0.1x–5x) next to the number, and its switch is now called **Pitch** (on: the sound gets higher when sped up).
- **Transcript**: a "Transcript-based editing" card to start: pick the **spoken language** and the **track to transcribe** (all audio, or one voice or video track), then Transcribe.
- **Audio clip panels, CapCut-style**: **Basic** has volume (dB, with keyframes), **fade in and out** sliders (heard in preview and export, and shown on the waveform), a **Noise reduction** switch, **Beats detection** (marks the music's beats on the timeline so cuts land on them; switch off to remove the marks) and **Enhance voice** (clean up, trim silence, duck music). The new **Voice changer** tab has presets (Chipmunk, Child, Higher, Lower, Deep, Giant, Monster) and a pitch slider (±12 semitones) that change the voice without changing its speed.
- **Screen recorder window** (desktop): New screen recording (or Ctrl+Shift+R) opens a small recorder that stays on top, like Camtasia, with switches for Full screen or a Region (drag the area, shown in pixels), Camera (live preview, pick the camera), Microphone (live level, pick the mic) and System audio, and a big Rec button with countdown, pause, stop and discard. The recorder is left out of the recording. When you stop, choose **Save video…** (one file with your voice and system sound mixed in) or **Open in editor** to cut and export it.
- **Whisper speech models in Settings → Local models**: download, check the size of, or remove the Tiny, Small, Medium and Large v3 Turbo models used by Captions, the transcript and Sync with voice, next to the AI export models.

### Fixed

- Sinhala and Tamil word suggestions open as a dropdown right under the word you're typing (instead of a strip across the panel), flip above it near the bottom of the screen, follow the mouse, and show the keys: ↑↓, Space or Enter, the number keys and Esc.
- Project thumbnails on the home screen are no longer black: they show the first frame that has something on it (instead of the very first frame), and refresh while you edit and each time you open the project.
- The FrameFlow logo in the app (home, settings, sign-in, the editor's top-left menu and the website header) is now the real app icon instead of a plain play button or the old "W" mark.
- Local models now download from the Worksuite download center first and fall back to the public source, so a moved or private public link no longer stops the download (the "Download failed (404)" and "(401)" errors). The new "Local models" workflow mirrors every model to the download center. The public fallbacks now point at working copies of Real-ESRGAN x4plus, RIFE 4.7 and Whisper Medium.

## [1.2.0] - 2026-10-24

### Added

- **English and Sinhala in one line**: Text → Basic has a new **Sinhala font** setting. English letters use the main font and Sinhala letters use the Sinhala font you pick (Noto Sans Sinhala, Noto Serif Sinhala, Abhaya Libre, Yaldevi, Gemunu Libre or Stick No Bills), in the preview and in exports. Legacy FM/DL fonts still apply to the whole text.
- **Show text with the voice**: Text → Basic → **Sync with voice** listens to the voice under a text clip and shows each word as it's spoken. You can also pick it as the **Show with voice** caption animation. Without an internet connection for the speech model, the words are spread evenly over the clip instead.

## [1.1.0] - 2026-10-24

### Added

- Import your own fonts (Settings → Fonts, or + Import font files in the font list): TTF, OTF and WOFF files you own, such as FM and DL Sinhala fonts, are kept on this computer and load every time FrameFlow starts. They appear under My fonts and, for Sinhala legacy fonts, under සිංහල. Type in Singlish or Unicode as usual; legacy fonts get the text converted automatically, in the preview and in exports.
- **250 more text animations and 250 more text templates** in the Text library (Studio packs, built in and in the download center). Animations come in 14 styles: reveals, slides, pop & bounce, elastic, typewriter & decode, kinetic, glitch, blur & focus, masks & wipes, 3D & flips, emphasis loops, exits, karaoke & captions, and counters & numbers. Templates come in 15 groups: titles, subtitles, lower thirds, kinetic posters, quotes, social (16:9, vertical 9:16 and square 1:1), sales & promo, events, podcasts, tutorial steps, end screens, Avurudu, Vesak, Thai Pongal and Deepavali greetings, minimal, neon & retro, and corporate. Every template has English, Sinhala and Tamil text, and everything is searchable in all three languages.
- **Text animations and text templates**: Text → **Animate** has a library of letter, word and line animations and animated text templates (titles, lower thirds, captions, quotes, social cards) with live hover previews, search in English, Sinhala and Tamil, favourites and recently used; double-click to add one at the playhead, drag it onto the timeline, or drop it on a text or caption clip to animate it. Text clips get an **Animate text** properties tab with In, Emphasis and Out effects (40+ effects such as typewriter, scramble, wave, neon flicker, mask wipe, highlight sweep, karaoke fill and number counter), animate by letter, word, line or whole text, stagger order, direction, easing curves, intensity and keyframes, with live preview, undo, presets that follow your account, and **Apply to all captions** that follows spoken word timings. Sinhala and Tamil letters are never split. Export animated text, templates and animation clips as Lottie JSON or .lottie, and import .lottie files with several animations (pick which), their pictures, colours and editable text layers. Text packs also come from the download center.
- Motion Studio groups can nest: select whole groups (with other layers if you like) and group them again. Grouping inside a group keeps the new group there, and ungrouping moves the contents up one level. Showing, hiding and locking a group covers everything inside it.
- Importing a Lottie that FrameFlow exported now brings animated GIF layers back as animated GIFs, not just their first frame.
- The web editor can be deployed to https://frameflow.worksuitecloud.com on Cloudflare Workers with the new **Deploy web** workflow (run it from Actions after adding the Cloudflare and app secrets listed in the workflow).
- Pro packs from the Asset Library download with your Worksuite Cloud sign-in. If you're signed out or your plan doesn't include a pack, the download says so instead of failing.
- Downloaded packs now show up in their panels under **Downloaded**: transitions (click to load, double-click to apply to the selected cut), filters and colour profiles (with the strength slider), effect stacks, text templates, video templates, LUTs (Add puts them in your LUTs), graphics and stickers in Elements (added at the playhead on their own layer), and brand kits (Use loads the colours, fonts and logos, with undo).
- The Asset Library now works with the FrameFlow Asset Library server (Download Center): graphics and overlays, GIFs and stickers, and brand kits can be installed alongside the existing pack types, and the library checks for newly published assets every 15 minutes and as soon as you're back online, so they appear without restarting.
- Motion Studio Lottie import: text that changes over time (like a countdown) comes in as one text layer per version, each shown at its time; animated GIFs exported from FrameFlow come back as pictures. GIFs up to 900 frames now stay animated in Lottie exports (long ones use smaller frames).
- **Media library** on the home sidebar: every video, picture and sound from all your projects on this computer, with search, type filters, thumbnails and durations. Start a new project with a file, open its project, or download it.
- **Exports** on the home sidebar: a history of everything you've exported (format, size, resolution, project and where it was saved), with Show in folder in the desktop app, Open project, and filters by format.
- Animated GIFs in Motion Studio now follow the playhead on the canvas and stay animated in Lottie exports and in “Use in video” (each frame plays in a looping pre-composition).
- Drag GIFs and stickers from Elements → GIFs straight onto the timeline (they get ready while you hover). Dropped animated GIF/WebP files now get a clip at least one loop long instead of the default still length.
- Motion Studio icons: 25 original icons (heart, stars, arrows, play, bell, thumbs up, chat, pin, lightning, crown and more) you can search and add in any colour as editable vector paths. SVG files you import now become editable shapes (with their fills and strokes) when they're simple shapes; others are still added as a picture.
- Animated GIFs and WebPs in Motion Studio play in GIF, video and PNG-sequence exports, in step with the animation.
- Shortcut manager (Ctrl/⌘+/ or the project menu): search actions or keys, click a key to change it, + to add another key for the same action, × to remove one, and ↺ to put an action back to its default. Keys already in use ask before they are moved. Every action is listed, including ones without a key yet. Presets for Premiere Pro, Final Cut Pro and CapCut style keys, and Import/Export of your shortcuts as a file.
- New default shortcuts: = / − (or Ctrl/⌘ = / −) zoom the timeline, Shift+Z fits it, M adds a marker, Shift+M mutes and Shift+H hides the selected clips, Shift+R toggles ripple editing. If you had changed your shortcuts, these are only added where the key is still free.
- Motion Studio: the selected layer's motion path is drawn on the canvas, with a dot per position keyframe you can drag. Selecting a keyframe shows the property's value graph and speed graph over the whole animation.
- Transitions on the timeline: drag a transition from the Transitions panel onto a clip and it lands on the nearer cut (the cut glows as you hover). Each transition now shows as a bar across its cut: drag either end to change its length live (with a seconds readout, one undo step), click it to edit it in the Transitions panel, or remove it with ×. The panel and the timeline stay in sync: changing duration, speed (Slow, Normal, Fast, Snap), easing, direction or alignment updates the selected cut's transition straight away. Transitions can now be up to 5 s.
- Sinhala font pack: a **සිංහල** tab in the font picker lists free Unicode Sinhala fonts (Noto Sans Sinhala, Noto Serif Sinhala, Abhaya Libre, Yaldevi, Gemunu Libre, Stick No Bills) with live previews, and the legacy FM/DL fonts installed on your computer. Text stays Unicode and is converted when drawn in a legacy font, so switching fonts never loses your words.
- **සිංහල converter** in the text properties: convert between Unicode and legacy FM/DL text in either direction as you type or paste, turn Singlish into Sinhala, preview in any Sinhala font and size, copy either form, or use the result in the text clip with that font and size.
- Stretch text in one drag: on the preview, dragging a text box's corner now changes its width and height separately, so you can stretch, squeeze and resize it in a single gesture, live, with Properties (Scale X / Scale Y) following along. Hold Alt to keep its proportions. Other clips keep proportional corner scaling (Alt stretches them freely); edge handles still stretch one side.
- Motion templates in Motion Studio: 22 original, fully editable templates across Animated Titles, Lower Thirds, Logo Animations, Social Media Graphics, Subscribe & Like, Call-to-Action Buttons, Transitions, Infographics, Loading Animations, Animated Stickers and Intro & Outro. Search them, hover to preview, and click to start a project from one. Change every use of a colour or font at once from the canvas settings, and **Save as template** to keep your version in My templates.
- Motion Studio import and export: **Import Lottie** (.json or .lottie) on the Motion Studio home turns shapes, paths, pictures, solids and text into editable layers with their keyframes and easing, and lists anything it had to leave out (masks, effects, pre-comps, expressions). **Export** to Lottie JSON, .lottie, animated GIF (with transparency), MP4, WebM with transparency, a PNG sequence (.zip) or an SVG of the current frame, with resolution, frame rate, length, loop/repeat, quality and transparency settings.
- **Use in video** in Motion Studio adds the animation to the video editor's Motion tab (My imports). It stays linked: clips update when you change the animation, and the clip's properties have **Open in Motion Studio**.
- Motion Studio keyframe editor: expand a layer to see a row per animated property, drag keyframes to retime them (snapped to frames), Shift-click to select several, Delete to remove, and Ctrl+C / Ctrl+V to paste them at the playhead (onto the selected layer). Pick a keyframe to edit its easing in a curve editor: drag the handles, choose Linear, Ease in, Ease out, Ease in-out, Back out or Snappy, or type a cubic-bezier. Zoom the timeline with Ctrl+scroll or the buttons, and set playback to loop, play once or bounce, reversed, at 0.25× to 4×.
- **Motion Studio** (Motion Studio on the start screen, or Open Motion Studio in the editor's Motion tab): design vector animations on their own canvas in 16:9, 9:16, 1:1, 4:5 or any size, frame rate and length. Add rectangles, ellipses, stars, text, pictures and SVGs, or draw paths with the pen (drag for curves, edit points and Bezier handles). Move with snapping and alignment guides, scale and rotate with handles, and set anchor points; zoom and pan with rulers. Layers can be grouped, hidden, locked and reordered. Animate position, scale, rotation and opacity with keyframes (the ◆ next to each property, or edits at the playhead once a property is animated) and play it back. Undo and redo, and every change is saved on this device; recent motion projects show on the Motion Studio home.
- **Motion graphics** and **Templates** on the start screen: each opens a new project with its library ready. The editor's sidebar has a new **Motion** tab with all animations, your imports and saved motion edits.
- Import Lottie animations as `.lottie` (dotLottie) files as well as `.json`, from the Motion tab or Media; pictures inside the file are kept.
- GIFs in Elements: search GIPHY for GIFs and transparent stickers, browse Trending, Reactions, Business, Social Media, Education, Effects and Emoji, with search suggestions, favourites and recently used. Click to preview, then Insert to timeline (or double-click) to add it at the playhead on its own layer. Needs a free GIPHY API key, pasted in the panel once.
- Animated GIF and WebP files now play on the timeline and in exports (looping), instead of showing only their first frame.
- The start screen has three main choices: **New screen recording** (opens the recorder ready to record the screen), **New video project** (with a menu of sizes and frame rates) and **Open existing project**. Drop video, audio or image files anywhere on it to start a project with them already on the timeline.
- New FrameFlow loading animation on the project loading screen.
- “Social follow” in Animations: 18 original Facebook, TikTok and Instagram style follow, like, share and save buttons (follow → following, avatar plus badge, action rails, double-tap heart, link in bio and more), with words in English, Sinhala and Tamil. No platform logos.
- The Follow buttons now come with sound effects (click on follow, pop on likes and saves, whoosh on slide-ins, ding on the bell), and the Facebook-style like is a neutral rounded badge with an outlined thumb and sparkles.
- Motion Editor: double-click an animation clip (or Edit motion… in its properties) to change its colours (with your brand kit), words and fonts in English, Sinhala or Tamil, pictures such as your YouTube channel profile photo in the subscribe channel bar's avatar circle, timing (speed, delay, end hold, loop, trim), and its sound cues; hide parts, and save the result as your own asset. Edits are kept on the clip with undo and redo, survive pack updates, and export exactly as previewed.
- Asset Library with downloads from the Worksuite download center: browse motion graphics, sounds, transitions, effects, filters, colour profiles, LUTs, fonts and templates by type, search in English, Sinhala or Tamil, and install packs with progress, pause and resume. Packs are checked against a signed catalog and their SHA-256 before they are unpacked, update themselves (optional), and the built-in Worksuite packs show as installed and work offline. Publish packs with an `assets-v*` tag.
- Adding an animation from a pack you don't have yet drops in a placeholder and downloads the pack; it fills in when ready. Projects that use missing packs fetch them when opened (Asset Library → Settings: download automatically, ask first, or never), stay editable offline, and can be limited to Wi-Fi and a storage cap. Scripts and AI agents get `assets.search`, `assets.install` and `assets.apply` in the automation API, `wve` and MCP.
- Sound effects for animations: an original click, pop, bell, whoosh and confetti shimmer are placed on an audio track, timed to the click, pop, bell or burst, when you add a subscribe button or the click, bell, like, mouse-click or confetti animations. Untick “Add sound” in Animations to leave them out; hover previews play sound after you click in the panel, with a mute button.
- A “YouTube & subscribe” category in Animations: 16 original animated subscribe, bell and like buttons, with words in English, Sinhala and Tamil. Filter the library by language, or switch an added clip's language in its properties without losing its timing or colours.
- The macOS app now includes FFmpeg (an LGPL-only build made by the new “FFmpeg for macOS” CI workflow), so proxies, HEIC and MKV conversion and the other FFmpeg features work on Mac too, on both Apple Silicon and Intel.
- Captions and AI in the automation API, `wve` and MCP: `transcript.get`, `transcript.generate`, `transcript.setText`, `transcript.import`, `transcript.export`, `transcript.translate`, `transcript.cleanUp` and `captions.add`. Scripts and AI agents can now transcribe, fix, translate and caption a video.
- Automation over gRPC (feature flag): start with `--automation-grpc` (or `WVE_AUTOMATION_GRPC=1`) next to the automation API, and the same methods and events are served on 127.0.0.1:7521 with the same token. The service definition is `automation.proto`.
- 24 more interface languages: Arabic, Bengali, Chinese (Simplified), Dutch, French, German, Hebrew, Hindi, Indonesian, Italian, Japanese, Korean, Malay, Persian, Polish, Portuguese, Russian, Spanish, Swedish, Thai, Turkish, Ukrainian, Urdu and Vietnamese. Arabic, Hebrew, Persian and Urdu lay the interface out right to left. These are machine translations awaiting review by native speakers, and the language list says so.
- Dockable panels: drag a panel's title onto another panel to dock it beside it, above or below, or as a tab; close panels and reopen them from Workspace options → Panels; press ` to maximise the panel under the pointer and again to restore. Switching workspace or Reset panel docking puts panels back.
- Drag a project tab out of the window to open that project in its own window where you drop it, and drag it onto the main window's project switcher to bring it back.
- Claude and OpenAI as AI providers: pick one in Settings → AI and add your own key for translation, clean-up and clip suggestions. Cloud transcription still uses Gemini.
- Undo now survives a restart: reopen a project and Ctrl+Z steps back through your last 50 timeline edits, and redo works too.
- Translation memory: when you correct an AI translation, FrameFlow shows Gemini your wording the next time it translates into that language, this project's corrections first. See how many it holds, or clear them, in Settings → AI.
- **Arrange layers → Free tracks** in Project settings: clips stay where you drop them on every track, instead of the main track pulling them to the start.
- Each synced project can sync automatically or only when you press Sync now.
- A project can have its own brand kit: tick **Separate brand kit for this project** in the Brand kit panel. Other projects keep the shared kit, and the right one is loaded whenever you switch projects.

- Project folders now keep editing proxies in their proxies/ folder, so a project opened from its folder on another computer doesn't need to make them again; proxies of deleted media are removed.

- Automation API events: clients can `events.subscribe` to project.opened, project.saved, timeline.changed, export.started and export.finished and get them pushed on the same connection; `wve events [topic…]` prints them as JSON lines.

- Blur and pixelate areas can be dragged on the preview: drag inside the box to move it, drag a corner to resize; each drag is one undo step.

- Transition presets: set up a transition (type, duration, easing, direction, alignment) and **Save as preset**; presets appear under My presets in Transitions — click to load, double-click to apply to the selected cut.

- GIF export can start anywhere: Export → GIF → Start at, with Beginning, Playhead and Selected clips (which also sets the length to the selection).

- Project backups: while you work, a copy of the project is kept every 10 minutes (the newest 20). Project settings → Defaults → Backups lists them; Restore opens a backup as a new project, leaving the current one untouched.

- Your own template packs (Text → Packs): **+ New pack**, then select titles and shapes and **Save selection as template**; templates adapt to every aspect like the built-in packs. Packs export and import as .ffpack.json files, and in the desktop app can be shared with your team through the asset library (**Share with team**, **Team packs**).

- The Podcast pack's Audiogram card now moves with your sound: each bar's height follows the timeline audio where the card is placed (the bars pulse when there is no sound).

- Template packs: **Fill host and guest from the transcript** (Text → Packs → Your details) reads speaker names from captions or the transcript ("Name:" lines or WebVTT voice tags) and fills the host and guest lower thirds.

- THIRD-PARTY-NOTICES now lists the fonts used by titles, captions and template packs, with their licences.

- Text styles can now go to every text on the same track (Apply to → every text on this track), so a caption look reaches a whole caption track without touching titles; "Copy this style now" applies the current look straight away.

- Template packs now use your brand kit logo: the YouTube intro, Thanks card and Podcast outro place it (fitted, on its own track) when "Brand kit" is ticked, and leave it out when the kit has no logo.

- Sinhala and Tamil typing now also works in the text box on the preview (double-click a title), with the same suggestions as the side panel.
- Animated stickers: the new **Drift** tab in Stickers has 870 Lottie animations (lower thirds, call-to-action buttons, callouts, reactions, app UI, broadcast frames, transitions and more), searchable by name or tag. They play in the preview and in exports; looping ones repeat, and ones with an outro hold until the end of the clip and then play out. The animations are CC BY-NC-SA 4.0.
- Animations library (Elements → Animations): 60 original animated graphics in seven sets: lower thirds with space for your own text, call-to-action buttons (subscribe, bell, like, comment, share, follow, link, swipe up, five stars, tap here), callouts, reactions, Sri Lankan seasonal graphics (Avurudu, Vesak, Poson, Christmas, Deepavali, Ramazan), full-frame transitions, and status and chart graphics. Hover to preview, click + or double-click to add at the playhead, or drag onto the timeline. Change any of their colours (or apply your brand colours), speed and looping in the Animation tab; they play the same in the preview and in exports. Import your own Lottie (.json) files from Media too; their colours are picked up automatically.

- Sinhala and Tamil typing: a Tamil99 keyboard (Typing language menu → Tamil keyboard), next-word suggestions learned from what you type (press 1–5 after a space), much bigger built-in word lists (about 3,600 Sinhala and 63,000 Tamil words), and **Check spelling…** for the text box you are typing in, with replacements and Add to dictionary.

- The desktop app can export the frame at the playhead as HEIC (Export → Frame → HEIC), about half the size of a JPEG of the same quality.

- In the desktop app, a HEIC photo FrameFlow's own reader can't open is converted to JPEG through FFmpeg instead of failing.

- HEIC photos: the date taken, camera and place (with a map link) now show in a photo's right-click menu in the media bin; files with several pictures (bursts, collections) can be imported whole, in order; and wide-gamut Display P3 photos are converted to the project's colours instead of looking washed out.

- 360° subject tracking: aim a 360° clip's camera at someone or something and press **Follow subject** in its 360° tab; the camera's pan and tilt are keyframed to keep it centred to the end of the clip, even as it moves round behind the viewer.

- The desktop app now opens 360° camera originals directly: Insta360 .insv (dual fisheye), GoPro MAX .360 and cubemap 360° videos are converted to standard 360° video (up to 4096×2048) on import, keeping 4-channel spatial sound.

- 360° horizon lock: in a 360° clip's 360° tab, **Level horizon** reads the motion data GoPro cameras record (GPMF orientation, gravity or gyro) and keyframes the 360° camera so the horizon stays level while the view still follows where the camera turned; **Lock view** also holds the direction steady.

- 360° projects keep 4-channel ambisonic sound from 360° cameras and tag it as spatial audio in MP4 exports, so YouTube and headsets play it as sound that turns with the view (desktop app; the browser exports it as stereo).
- In 360° projects, titles, logos and pictures can be pinned to the sphere (360° menu → Pin selected titles to the sphere): they curve correctly in the 360° video and face the viewer from the direction you set. Direction, height, tilt and size are in the item's new 360° tab and can be keyframed.
- In 360° projects, blurs, glows and other effects wrap across the left/right edge of the sphere, so no line shows where the picture's ends meet. Vignette, Mirror and Wave can't wrap and are greyed out there.
- 360° projects can hide the tripod or selfie stick: the 360° menu covers the bottom of every 360° clip with a blurred patch (size, soft edge, blur or colour in the clip's Effects), or lays your logo flat under the viewer on its own track.
- Desktop exports can be AV1 10-bit (.mp4) and, where the computer has a hardware HEVC encoder, HEVC 10-bit (.mp4). Both also work for HDR projects, tagged HLG or PQ with BT.2020 so YouTube and players show them as HDR.
- A colour-accuracy check for camera LUTs: it measures FrameFlow's result against the camera maker's own result (CIEDE2000), ready for DJI D-Log M test footage.
- Imported LUTs now follow your Worksuite account: the files upload with settings sync and appear, ready to use, on your other devices.
- Grades are a stack of nodes: add Wheels & sliders or Curves & HSL nodes to a clip, turn each on or off, and reorder them. Choose Whole timeline in the Color panel to grade every clip at once with its own node stack; it's saved with the sequence and used in exports.
- Curves can be keyframed: add a key at the playhead in the Curves section, move the playhead and change the curve to add another, and the grade morphs between them. Click a key's time to jump to it.
- Check setup in the Record panel tests your devices before you record: that each one opens, the resolution and frame rate it really delivers, whether the encoder keeps up with the chosen quality, and disk write speed, with advice for anything that falls short.
- Multicam clips can sync by timecode: angles line up from the start timecode that cameras and recorders write into MOV and MP4 files, including drop-frame and recordings across midnight.
- Screen recordings pause by themselves while a protected app is open (password managers by default; edit the list in the Record panel) and carry on when it closes. Protected windows can't be picked as the source. Do not disturb holds notification pop-ups back while recording on Windows and GNOME; it's put back when you stop.
- Record part of the screen: drag a box on the screen's picture in the Record panel (Whole screen to undo). The video is only that area, and zooms and the clean cursor line up with it.
- The floating recording bar has a camera on/off button and a Pen for drawing on the screen while recording (pick a colour, Clear to wipe, Esc to stop drawing). The drawing is part of the recording.
- Punch-in voice-over: set In and Out points and the take replaces only that range, stopping at Out. Each take over the same range is kept, and you switch between takes in the clip's Voice tab.
- Audio clips have a Voice tab: Clean up voice removes background noise, makes speech clearer and levels it to about −16 LUFS (Use original puts the recording back).
- Trim silence cuts the quiet start and end of a voice clip and can shorten long pauses; later clips on the track move up.
- Duck music under this voice lowers clips on other audio tracks while the voice speaks, with smooth ramps you can edit as volume keyframes.
- Screen recordings: draw a clean cursor from the recorded input log, with size, smoothing, click ripples and hide-when-idle (new recordings leave the system cursor out so it can be restyled); optional shortcut-key badges such as "Ctrl + S" (typed text is never recorded); a background behind the screen with padding, rounded corners, shadow and a colour or gradient, with zooms staying inside the card. Zooms show as a Zoom lane on the clip: drag to move, drag edges to trim, double-click to add or delete.
- AI suggestions in the Captions panel: suggest clips from the transcript for a chosen platform, or a vertical reframe that follows the speaker. Suggestions show dashed with the model's confidence, on the timeline and in a list, and nothing changes until you approve one: an approved clip becomes its own sequence (9:16 for vertical platforms, with the suggested caption style), an approved reframe re-centres that part of the video. "Hide from AI" areas are blurred out of every frame sent to a cloud model. Clip lengths per platform are editable in Settings → AI.
- AI spending: every AI job shows its estimated cost first, and a monthly spending cap in Settings → AI stops jobs that would go over it. Spend is worked out from the tokens Gemini reports, with editable prices. Identical AI jobs are answered from a local cache for free. Rate limits and brief Gemini outages are retried automatically, and AI answers are checked strictly before they change your project.
- Captions: choose which track holds the narration before transcribing. Captions now remember the speech they belong to and follow it when you trim, move, cut or speed up the clip; captions whose speech is cut out hide until it comes back. Transcripts keep word timings, re-aligned after AI clean-up, translation or edits, and a new "Highlight spoken word" caption animation colours each word as it's said (imported subtitles use estimated timings).
- Export: AI Ultra HD and Optical flow run on your computer with models you download once from Settings → Local models (or import from a file). Each option shows a hardware check, the extra time it adds, an Example before/after and its plan label when your plan has one. ProRes 422 HQ (.mov) and FFV1 lossless (.mkv), both 10-bit, export through the bundled FFmpeg on desktop. GIF options: colours, dithering, loop and length limit. An estimated export time, an 8K step, and MP3/M4A audio export on desktop.
- Sequences: keep several versions of an edit in one project, e.g. 16:9 and 9:16, each with its own frame size. Use the sequence tabs beside the timeline's scene button; "+" copies the current edit into a new shape. "Export all sequences" queues one file per sequence. Presenter layouts for screen recordings (Layout menu, with the screen and camera clips selected): screen above presenter, presenter above screen, focused screen with camera inset, or full-width screen on a background.
- Track lock: lock a track from its header or right-click menu, and edits that would change it are refused with a message. Privacy regions: "Blur an area" and "Pixelate an area" in Effects hide part of the picture, as a rectangle or ellipse with a soft edge. Autosave interval in Project settings (continuous, 30 seconds, 1 minute or 5 minutes). Export audio only (WAV, plus MP3/M4A where your system can encode them) or the current frame as PNG/JPEG. An export queue runs exports one after another with cancel and retry. Exports are written to a temporary file and moved into place, so an interrupted export never leaves a broken file.
- Projects in their own windows: open a project tab in a new window or move it back to the main window; closing a window saves your work and only asks if the save fails. Clips pasted into a project of another size keep their place in the frame, copies also put text on the system clipboard, and text pasted from other apps becomes a title clip (or captions, for SRT/WebVTT). Ctrl/Cmd+Shift+C copies the current frame as an image.
- HDR finishing: Nits and False colour scopes in HDR projects (lines at 100, 203 and 1,000 nits; red over 1,000 nits, yellow above graphics white, magenta outside Rec. 709); HDR exports now carry HDR10 metadata (MaxCLL, MaxFALL measured from the timeline, and the mastering display); YouTube HDR 4K/1080p and Reels HDR export presets; LUTs are tagged SDR or HDR and an SDR LUT asks before going on an HDR project; effects that can't work in HDR are greyed out there; MaxCLL/MaxFALL stored in imported files are read and shown.
- Multicam: make a multicam clip from 2–9 camera angles (Multicam button on the timeline toolbar), synced by sound, recording time or by hand. Cut between angles live in the angle viewer (click or press 1–9 while playing), change any cut's angle afterwards, take audio from one angle or follow the picture, copy a grade to every cut of an angle, and let it cut to whoever is speaking.
- Screen recordings now log the cursor, clicks and typing (as data, not in the video) and zoom in on the action automatically. Change each zoom's level, length, ease and focus, follow the cursor smoothly, add zooms by hand on any video, or re-generate them in the clip's new Zoom tab.
- Floating recording bar with timer, pause, marker, mic mute, discard and stop, kept out of the recording, plus shortcuts that work in any app (Ctrl/Cmd+Shift+R start/stop, +P pause, +M marker; change them in the Record panel).
- Render cache: click Render on the preview toolbar (or let it run automatically when idle) to pre-render the timeline in 2-second parts so effects-heavy sections play smoothly. The strip under the button shows rendered (green) and changed (red) parts; an edit only re-renders the parts it touches. Choose the mode and preview quality in Project settings → Performance. Export never uses the cache.
- Proxies for smooth editing of 4K and other large clips: the desktop app makes lightweight copies in the background with a bundled FFmpeg (LGPL), on your GPU when it can. Choose when to make them, their size, the encoder and background priority in Project settings → Performance, and switch between proxies and originals on the preview toolbar. Export always uses the original files.
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

- The web app builds for Cloudflare Workers: Next.js 16.1.7 (from 16.1.3) and AI export's runtime loader no longer trip the Workers bundler.
- Timeline zoom is smoother, and the last thumbnail of a video clip now shows its own frame instead of the poster.
- After adding an animation from Elements → Animations, its controls and **Edit motion…** show straight away (its sound clips are no longer selected with it). Escape closes the Motion Editor, and Ctrl/Cmd+Z works in it as soon as it opens. The properties panel no longer shows a stray "0" after "elements selected".
- Video clips on the timeline show a real filmstrip: each thumbnail is the frame at that point of the clip, and they update when you trim, move, zoom or change the speed (they used to repeat one frame). Frames load only for what's on screen.
- The “Tap here” and “Finger tap” animations used a pointing hand that could read as a rude gesture. They are now “Mouse click” (a computer mouse whose left button clicks) and “Cursor click” (a mouse cursor clicking the subscribe button). Projects that used “Tap here” get “Mouse click”.

- Media deleted from a project saved as a project folder is now also removed from the folder's media folder on the next save.

- Changing a project's shape (for example 16:9 to 9:16) with "Fit" now also resizes titles and captions so they fit inside the new frame's safe area, instead of running off the sides.

- Pasting a HEIC photo (or an Insta360 / GoPro 360° file) copied from a file manager now imports it; before, files without a recognised type were ignored.

- Clip analysis (tracking and other effects that read the video) now uses the sample size it asks for instead of always 320 pixels wide.
- A sequence's own frame size (for example a 9:16 copy) is now kept when the project is saved and reopened.
- Voice-over recordings no longer show a warning that the cursor couldn't be logged.
- Editing the timeline while it plays no longer logs "Input has been disposed" errors from audio playback.
- Creating a project through the automation API (`wve new`) now opens it in the editor window.
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
- 360° clips get sharper editing proxies (2880×1440, or the original size if smaller), so the reframed view stays clear while 5.7K and 8K footage plays smoothly.
- 10-bit SDR footage (for example 10-bit H.264, HEVC Main 10, VP9 or AV1, such as camera log clips) is now decoded at full precision and stays 10-bit into 10-bit exports.
- 10-bit HDR footage (HLG and PQ) keeps its full precision all the way into 10-bit desktop exports, instead of passing through 8 bits on the way.
- 10-bit desktop exports (ProRes, FFV1, AV1 and HEVC 10-bit) now take frames straight from the 16-bit engine, so gradients, grades and scaled images keep their in-between shades instead of 8-bit steps.
- Effects and grades are now worked out in 16-bit float on GPUs that support it, so stacked grades and strong adjustments no longer band (smooth gradients keep all their steps).
- The HEIC photo decoder (libheif, LGPL) now ships as its own replaceable file, and the installer includes notices for its LGPL components (libheif and FFmpeg) with their source and how to swap in your own build.
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

- Text library: vertical (9:16) and square (1:1) text templates now preview in their own shape instead of being stretched across the 16:9 tile.
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

- Dragging a transition's ends on the timeline moves the preview to that cut, so you see the new length as you drag.
- Timeline zoom is smooth: Ctrl/⌘+scroll zoom no longer stutters on long or zoomed-in video clips (only the thumbnails near the visible area are drawn), and the zoom buttons now glide to the new zoom instead of jumping.
- New home screen: “Start something new” with large New video project (Ctrl+N), New screen recording (Ctrl+Shift+R) and Motion graphics cards, quick Templates sizes (16:9 YouTube, 9:16 Reels, 1:1 Post), Open existing project and a drop zone, then your recent projects. The sidebar has Home, Recent projects, Templates, Motion graphics and Screen recordings with counts, and search is in the middle of the top bar (Ctrl+K).
- Corners are slightly rounded (5px) everywhere for a softer, consistent look.
- Square corners across the whole interface: panels, buttons, menus, inputs, chips, the Asset Library, the Motion Editor and timeline clips.
- The window title bar is dark in dark mode and light in light mode, following the app's theme setting, and remembers it on the next launch.
- New app icon (frames with a play button and a timeline bar) for the desktop app on macOS, Windows and Linux, and for the browser tab and home-screen icons.
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
