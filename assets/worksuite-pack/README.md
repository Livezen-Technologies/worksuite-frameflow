# Worksuite Assets

Original animated motion graphics for Worksuite FrameFlow, made entirely from code in
[`scripts/assets/pack`](../../scripts/assets/pack). They are Lottie files (30 fps, no text
layers) with colour slots, so the editor can recolour them. Licence: MIT, like the rest of the repository.

Rebuild with `bun scripts/assets/build-worksuite-pack.ts` and check with
`bun scripts/assets/validate-worksuite-pack.ts`. Do not edit the generated files by hand.

Sound effects (click, pop, ding, whoosh, confetti) live in [`sounds/`](sounds); they are synthesised by
`python3 scripts/assets/build-sounds.py`. Assets list them in `asset.json` → `sounds` (`file`, `at` in
seconds, optional `gainDb`), and the editor places them on an audio track when the animation is added.

## Lower thirds (10)

| Preview | Asset | Length | Colours |
| --- | --- | --- | --- |
| <img src="lower-thirds/lt-bar-slide/thumbnail.png" width="128" alt=""> | **Bar slide** `lt-bar-slide`<br>An accent line grows, then a title bar and a subtitle bar slide out from it. | 4 s | Title bar `#4C8DFF`<br>Subtitle bar `#0F1115`<br>Accent `#F5A524` |
| <img src="lower-thirds/lt-pill-pop/thumbnail.png" width="128" alt=""> | **Pill pop** `lt-pill-pop`<br>A rounded pill pops in with a pulsing dot on its left edge. | 4 s | Pill `#FFFFFF`<br>Dot `#2EC4B6`<br>Ring `#4C8DFF` |
| <img src="lower-thirds/lt-double-stack/thumbnail.png" width="128" alt=""> | **Double stack** `lt-double-stack`<br>Two stacked bars drop into place one after the other. | 4 s | Top bar `#2EC4B6`<br>Bottom bar `#FFFFFF`<br>Edge `#0F1115` |
| <img src="lower-thirds/lt-corner-brackets/thumbnail.png" width="128" alt=""> | **Corner brackets** `lt-corner-brackets`<br>Four corner brackets draw themselves around a clear space for a name. | 4 s | Brackets `#FFFFFF`<br>Accent line `#F5A524` |
| <img src="lower-thirds/lt-underline-sweep/thumbnail.png" width="128" alt=""> | **Underline sweep** `lt-underline-sweep`<br>A long line sweeps across with a travelling dot, then a shorter line follows. | 4 s | Line `#FFFFFF`<br>Dot `#2EC4B6`<br>Short line `#4C8DFF` |
| <img src="lower-thirds/lt-glass-card/thumbnail.png" width="128" alt=""> | **Glass card** `lt-glass-card`<br>A translucent dark card rises with a coloured edge and a soft highlight. | 4 s | Card `#0F1115`<br>Edge `#2EC4B6`<br>Highlight `#FFFFFF` |
| <img src="lower-thirds/lt-angled/thumbnail.png" width="128" alt=""> | **Angled slab** `lt-angled`<br>A slanted slab slices in with a thin parallel stripe. | 4 s | Slab `#F5A524`<br>Stripe `#0F1115` |
| <img src="lower-thirds/lt-dots-line/thumbnail.png" width="128" alt=""> | **Dots and line** `lt-dots-line`<br>Three dots pop in a row, then a line and a bar extend from them. | 4 s | Dot 1 `#4C8DFF`<br>Dot 2 `#2EC4B6`<br>Dot 3 `#F5A524`<br>Bar `#FFFFFF` |
| <img src="lower-thirds/lt-split-reveal/thumbnail.png" width="128" alt=""> | **Split reveal** `lt-split-reveal`<br>Two bars rush in from opposite sides and meet to form a title strip. | 4 s | Left bar `#4C8DFF`<br>Right bar `#2EC4B6`<br>Seam `#FFFFFF` |
| <img src="lower-thirds/lt-corner-tag/thumbnail.png" width="128" alt=""> | **Corner tag** `lt-corner-tag`<br>A tag with a round badge slides in on the right of the frame. | 4 s | Tag `#0F1115`<br>Badge `#F5A524`<br>Badge mark `#FFFFFF` |

## Call to action (10)

| Preview | Asset | Length | Colours |
| --- | --- | --- | --- |
| <img src="call-to-action/cta-subscribe-click/thumbnail.png" width="128" alt=""> | **Subscribe click** `cta-subscribe-click`<br>A cursor glides to a play-button pill and clicks it; the pill switches to its pressed colour.<br>Sounds: click @ 1.13 s | 3 s, loops | Pill `#4C8DFF`<br>Pressed pill `#0F1115`<br>Icon `#FFFFFF`<br>Cursor `#F4F6FA`<br>Cursor outline `#F5A524` |
| <img src="call-to-action/cta-bell-ring/thumbnail.png" width="128" alt=""> | **Bell ring** `cta-bell-ring`<br>A notification bell swings back and forth while sound arcs pulse out.<br>Sounds: ding @ 0.27 s | 3 s, loops | Bell `#F5A524`<br>Clapper `#0F1115`<br>Sound arcs `#FFFFFF` |
| <img src="call-to-action/cta-like-thumb/thumbnail.png" width="128" alt=""> | **Like thumb** `cta-like-thumb`<br>A thumbs-up pops with a burst of short lines.<br>Sounds: pop @ 0.33 s | 3 s, loops | Hand `#4C8DFF`<br>Cuff `#0F1115`<br>Burst `#F5A524` |
| <img src="call-to-action/cta-comment-bubble/thumbnail.png" width="128" alt=""> | **Comment bubble** `cta-comment-bubble`<br>A speech bubble pops up and three typing dots bounce inside it. | 3 s, loops | Bubble `#FFFFFF`<br>Dots `#4C8DFF` |
| <img src="call-to-action/cta-share-arrow/thumbnail.png" width="128" alt=""> | **Share arrow** `cta-share-arrow`<br>A curved arrow springs forward from a round button. | 3 s, loops | Button `#2EC4B6`<br>Arrow `#FFFFFF` |
| <img src="call-to-action/cta-follow-plus/thumbnail.png" width="128" alt=""> | **Follow plus** `cta-follow-plus`<br>A round plus button spins in, turns to a tick and back, with a pulse ring. | 3 s, loops | Button `#4C8DFF`<br>Mark `#FFFFFF`<br>Ring `#2EC4B6` |
| <img src="call-to-action/cta-link-pointer/thumbnail.png" width="128" alt=""> | **Link pointer** `cta-link-pointer`<br>A chain-link badge with an arrow bouncing down towards it. | 3 s, loops | Badge `#FFFFFF`<br>Link `#0F1115`<br>Arrow `#F5A524` |
| <img src="call-to-action/cta-swipe-up/thumbnail.png" width="128" alt=""> | **Swipe up** `cta-swipe-up`<br>Three chevrons light up in a rising cascade. | 3 s, loops | Chevrons `#FFFFFF`<br>Glow `#2EC4B6` |
| <img src="call-to-action/cta-five-star/thumbnail.png" width="128" alt=""> | **Five-star rating** `cta-five-star`<br>Five stars pop in one after another and fill with colour. | 3 s, loops | Stars `#F5A524`<br>Empty stars `#FFFFFF` |
| <img src="call-to-action/cta-mouse-click/thumbnail.png" width="128" alt=""> | **Mouse click** `cta-mouse-click`<br>A computer mouse clicks its left button, which presses down and darkens, sending out a click ripple.<br>Sounds: click @ 0.67 s | 3 s, loops | Mouse `#FFFFFF`<br>Outline `#0F1115`<br>Pressed button `#AEB6C4`<br>Click ripple `#2EC4B6` |

## Callouts (10)

| Preview | Asset | Length | Colours |
| --- | --- | --- | --- |
| <img src="callouts/co-arrow-curved/thumbnail.png" width="128" alt=""> | **Curved arrow** `co-arrow-curved`<br>A hand-drawn curved arrow sketches itself on, then its head snaps into place. | 3 s | Arrow `#F5A524` |
| <img src="callouts/co-arrow-straight/thumbnail.png" width="128" alt=""> | **Nudging arrow** `co-arrow-straight`<br>A bold straight arrow nudges towards its target again and again. | 3 s, loops | Arrow `#FFFFFF`<br>Shadow `#0F1115` |
| <img src="callouts/co-circle-scribble/thumbnail.png" width="128" alt=""> | **Circle scribble** `co-circle-scribble`<br>A loose pen circle scribbles around a subject, overlapping at the end like a real marker. | 3 s | Marker `#F5A524` |
| <img src="callouts/co-underline/thumbnail.png" width="128" alt=""> | **Swoosh underline** `co-underline`<br>A brush-like swoosh underlines a word, with a second shorter stroke. | 3 s | Main stroke `#2EC4B6`<br>Second stroke `#4C8DFF` |
| <img src="callouts/co-highlight-swipe/thumbnail.png" width="128" alt=""> | **Highlight swipe** `co-highlight-swipe`<br>A translucent highlighter band swipes across from left to right. | 3 s | Band `#F5A524` |
| <img src="callouts/co-brackets/thumbnail.png" width="128" alt=""> | **Focus brackets** `co-brackets`<br>Square brackets close in from both sides to frame the subject, then breathe. | 3 s, loops | Brackets `#FFFFFF` |
| <img src="callouts/co-spotlight/thumbnail.png" width="128" alt=""> | **Spotlight** `co-spotlight`<br>The frame dims around a circle of light that settles on the subject. | 3 s | Dim `#0F1115`<br>Rim `#FFFFFF` |
| <img src="callouts/co-exclamation/thumbnail.png" width="128" alt=""> | **Exclamation badge** `co-exclamation`<br>A round warning badge pops in and gives a quick shake every loop. | 3 s, loops | Badge `#F5A524`<br>Mark `#0F1115` |
| <img src="callouts/co-check-stamp/thumbnail.png" width="128" alt=""> | **Check stamp** `co-check-stamp`<br>A circle stamps down and a tick draws itself inside. | 3 s | Circle `#2EC4B6`<br>Tick `#FFFFFF` |
| <img src="callouts/co-cross-stamp/thumbnail.png" width="128" alt=""> | **Cross stamp** `co-cross-stamp`<br>A circle stamps down and a cross strikes through it. | 3 s | Circle `#0F1115`<br>Cross `#F5A524` |

## Reactions (8)

| Preview | Asset | Length | Colours |
| --- | --- | --- | --- |
| <img src="reactions/rx-confetti/thumbnail.png" width="128" alt=""> | **Confetti burst** `rx-confetti`<br>Confetti bursts from the centre, tumbles and drifts down, then bursts again.<br>Sounds: confetti @ 0 s | 3 s, loops | Confetti 1 `#4C8DFF`<br>Confetti 2 `#2EC4B6`<br>Confetti 3 `#F5A524`<br>Confetti 4 `#FFFFFF` |
| <img src="reactions/rx-hearts/thumbnail.png" width="128" alt=""> | **Floating hearts** `rx-hearts`<br>Hearts float up and sway, fading as they rise, in a steady stream. | 3 s, loops | Hearts `#FF4D6D`<br>Soft hearts `#FFFFFF` |
| <img src="reactions/rx-sparkles/thumbnail.png" width="128" alt=""> | **Sparkles** `rx-sparkles`<br>Four-point sparkles twinkle in and out at different moments. | 3 s, loops | Sparkles `#F5A524`<br>Small sparkles `#FFFFFF` |
| <img src="reactions/rx-fireworks/thumbnail.png" width="128" alt=""> | **Fireworks** `rx-fireworks`<br>Three fireworks burst one after another in radiating streaks. | 3 s, loops | Burst 1 `#F5A524`<br>Burst 2 `#2EC4B6`<br>Burst 3 `#4C8DFF` |
| <img src="reactions/rx-clap-lines/thumbnail.png" width="128" alt=""> | **Impact lines** `rx-clap-lines`<br>Comic-style impact lines flash out from a point, like a clap or a hit. | 3 s, loops | Lines `#FFFFFF`<br>Accent `#F5A524` |
| <img src="reactions/rx-fire/thumbnail.png" width="128" alt=""> | **Fire** `rx-fire`<br>A flickering flame with layered tongues of colour. | 3 s, loops | Outer flame `#FF6B3D`<br>Middle flame `#F5A524`<br>Core `#FFFFFF` |
| <img src="reactions/rx-tears/thumbnail.png" width="128" alt=""> | **Tears** `rx-tears`<br>Teardrops well up and fall in two streams. | 3 s, loops | Drops `#4C8DFF`<br>Shine `#FFFFFF` |
| <img src="reactions/rx-shock-lines/thumbnail.png" width="128" alt=""> | **Shock lines** `rx-shock-lines`<br>Jagged lines jolt around the centre for a shocked or surprised moment. | 3 s, loops | Lines `#F5A524`<br>Inner lines `#FFFFFF` |

## Sri Lankan seasons (6)

| Preview | Asset | Length | Colours |
| --- | --- | --- | --- |
| <img src="sri-lanka-seasonal/sl-avurudu-sun/thumbnail.png" width="128" alt=""> | **New Year sun and lamp** `sl-avurudu-sun`<br>For Sinhala and Tamil New Year: a rising sun with turning rays above a lit oil lamp. | 4 s, loops | Sun `#F5A524`<br>Rays `#FFD166`<br>Lamp `#C9822B`<br>Flame `#FF6B3D`<br>Flame core `#FFFFFF` |
| <img src="sri-lanka-seasonal/sl-vesak-lantern/thumbnail.png" width="128" alt=""> | **Vesak lantern** `sl-vesak-lantern`<br>An original geometric Vesak lantern that sways gently, its tassels swinging and its centre glowing. | 4 s, loops | Frame `#F5A524`<br>Panels `#2EC4B6`<br>Glow `#FFE7A3`<br>Tassels `#FFFFFF`<br>Accent `#4C8DFF` |
| <img src="sri-lanka-seasonal/sl-poson-lights/thumbnail.png" width="128" alt=""> | **Poson lights** `sl-poson-lights`<br>Strings of small lamps swing between two points and twinkle in a chasing pattern. | 4 s, loops | Wire `#FFFFFF`<br>Lights 1 `#F5A524`<br>Lights 2 `#2EC4B6`<br>Lights 3 `#4C8DFF` |
| <img src="sri-lanka-seasonal/sl-christmas-star/thumbnail.png" width="128" alt=""> | **Christmas star** `sl-christmas-star`<br>A five-point star glows with long turning rays and small twinkles. | 4 s, loops | Star `#F5A524`<br>Rays `#FFFFFF`<br>Twinkles `#2EC4B6` |
| <img src="sri-lanka-seasonal/sl-deepavali-lamp/thumbnail.png" width="128" alt=""> | **Deepavali lamp** `sl-deepavali-lamp`<br>A clay oil lamp with a dancing flame and a soft warm glow, for Deepavali. | 4 s, loops | Lamp `#C2552B`<br>Pattern `#F5A524`<br>Flame `#FF6B3D`<br>Flame core `#FFFFFF`<br>Glow `#FFD166` |
| <img src="sri-lanka-seasonal/sl-crescent-stars/thumbnail.png" width="128" alt=""> | **Crescent and stars** `sl-crescent-stars`<br>A crescent moon rocks gently while stars twinkle around it, for Ramazan and Hajj. | 4 s, loops | Moon `#F5A524`<br>Stars `#FFFFFF`<br>Halo `#2EC4B6` |

## Transitions (8)

| Preview | Asset | Length | Colours |
| --- | --- | --- | --- |
| <img src="transitions/tr-circle-burst/thumbnail.png" width="128" alt=""> | **Circle burst** `tr-circle-burst`<br>A circle bursts out to fill the frame, then opens from the middle to reveal the next shot. | 2 s | Fill `#4C8DFF`<br>Edge `#2EC4B6` |
| <img src="transitions/tr-slide-panels/thumbnail.png" width="128" alt=""> | **Slide panels** `tr-slide-panels`<br>Three coloured panels sweep across one after another and slide away. | 2 s | Panel 1 `#F5A524`<br>Panel 2 `#2EC4B6`<br>Panel 3 `#4C8DFF` |
| <img src="transitions/tr-diagonal-wipe/thumbnail.png" width="128" alt=""> | **Diagonal wipe** `tr-diagonal-wipe`<br>A slanted band sweeps across corner to corner with a contrasting leading edge. | 2 s | Band `#0F1115`<br>Edge `#F5A524` |
| <img src="transitions/tr-vertical-bars/thumbnail.png" width="128" alt=""> | **Vertical bars** `tr-vertical-bars`<br>Vertical bars grow down in a ripple to cover the frame, then shrink away upwards. | 2 s | Bars 1 `#4C8DFF`<br>Bars 2 `#FFFFFF` |
| <img src="transitions/tr-diamond-zoom/thumbnail.png" width="128" alt=""> | **Diamond zoom** `tr-diamond-zoom`<br>A turning diamond zooms in to fill the frame, then a diamond-shaped window opens through it. | 2 s | Fill `#2EC4B6`<br>Outline `#FFFFFF` |
| <img src="transitions/tr-split-doors/thumbnail.png" width="128" alt=""> | **Split doors** `tr-split-doors`<br>Two halves slide shut like doors with a bright seam, then slide open. | 2 s | Left door `#0F1115`<br>Right door `#1B2030`<br>Seam `#F5A524` |
| <img src="transitions/tr-diagonal-stripes/thumbnail.png" width="128" alt=""> | **Diagonal stripes** `tr-diagonal-stripes`<br>Slanted stripes slide in from alternating sides to cover the frame, then slide on through. | 2 s | Stripes 1 `#F5A524`<br>Stripes 2 `#4C8DFF` |
| <img src="transitions/tr-blinds/thumbnail.png" width="128" alt=""> | **Blinds** `tr-blinds`<br>Horizontal slats close like window blinds, then open again. | 2 s | Slats `#FFFFFF`<br>Shade `#2EC4B6` |

## Status & infographics (8)

| Preview | Asset | Length | Colours |
| --- | --- | --- | --- |
| <img src="status-infographics/st-progress-ring/thumbnail.png" width="128" alt=""> | **Progress ring** `st-progress-ring`<br>A ring fills from empty to full with a dot riding its leading edge. | 3 s, loops | Track `#FFFFFF`<br>Progress `#2EC4B6`<br>Dot `#E8FFFC` |
| <img src="status-infographics/st-loading-dots/thumbnail.png" width="128" alt=""> | **Loading dots** `st-loading-dots`<br>Three dots bounce and brighten in a wave. | 3 s, loops | Dot 1 `#4C8DFF`<br>Dot 2 `#2EC4B6`<br>Dot 3 `#F5A524` |
| <img src="status-infographics/st-battery/thumbnail.png" width="128" alt=""> | **Battery charging** `st-battery`<br>A battery charges cell by cell with a lightning mark, then resets. | 3 s, loops | Case `#FFFFFF`<br>Cells `#2EC4B6`<br>Bolt `#F5A524` |
| <img src="status-infographics/st-wifi-bars/thumbnail.png" width="128" alt=""> | **Signal arcs** `st-wifi-bars`<br>Signal arcs light up from the dot outward, like a connection being found. | 3 s, loops | Lit `#4C8DFF`<br>Unlit `#FFFFFF` |
| <img src="status-infographics/st-counter-dial/thumbnail.png" width="128" alt=""> | **Gauge dial** `st-counter-dial`<br>A gauge needle sweeps up with a little overshoot and settles, while the scale fills. | 3 s, loops | Dial `#FFFFFF`<br>Fill `#F5A524`<br>Needle `#4C8DFF` |
| <img src="status-infographics/st-bar-chart/thumbnail.png" width="128" alt=""> | **Growing bar chart** `st-bar-chart`<br>Five bars grow in turn on a baseline, with a little bounce, and reset. | 3 s, loops | Bars `#4C8DFF`<br>Top bar `#2EC4B6`<br>Baseline `#FFFFFF` |
| <img src="status-infographics/st-pie-fill/thumbnail.png" width="128" alt=""> | **Pie fill** `st-pie-fill`<br>A pie chart fills slice by slice around a ring of three colours. | 3 s, loops | Slice 1 `#4C8DFF`<br>Slice 2 `#2EC4B6`<br>Slice 3 `#F5A524`<br>Background `#FFFFFF` |
| <img src="status-infographics/st-timeline-dots/thumbnail.png" width="128" alt=""> | **Timeline steps** `st-timeline-dots`<br>A line draws across and four milestone dots pop on in sequence. | 3 s, loops | Line `#FFFFFF`<br>Dots `#F5A524`<br>Rings `#4C8DFF` |

## YouTube & subscribe (16)

Generic, brand-free subscribe, bell and like buttons. Assets with words come in English, Sinhala and Tamil
variants (`asset.json` → `variants`) with the same timing and colour slots. The words are vector outlines
shaped with HarfBuzz from OFL fonts (Inter, Noto Sans Sinhala, Noto Sans Tamil) by
[`scripts/assets/shape-text.py`](../../scripts/assets/shape-text.py); there are no text layers.

| Preview | Asset | Length | Colours |
| --- | --- | --- | --- |
| <img src="subscribe-buttons/sub-classic-click/thumbnail.png" width="128" alt=""> | **Subscribe click** `sub-classic-click`<br>A pill button pops in, a cursor glides over and clicks, and it turns grey with a tick and “Subscribed”.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: pop @ 0 s, click @ 1.47 s | 3.5 s | Button `#E53935`<br>Subscribed button `#3A3F4B`<br>Text `#FFFFFF`<br>Cursor `#F4F6FA`<br>Shadow & outline `#0F1115` |
| <img src="subscribe-buttons/sub-bell-combo/thumbnail.png" width="128" alt=""> | **Subscribe + bell** `sub-bell-combo`<br>The subscribe button is pressed, then a bell beside it rings with a wiggle and burst lines.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: pop @ 0 s, click @ 0.93 s, ding @ 1.67 s | 4 s | Button `#E53935`<br>Subscribed & bell circle `#3A3F4B`<br>Text `#FFFFFF`<br>Bell & burst `#F5A524`<br>Shadow `#0F1115` |
| <img src="subscribe-buttons/sub-like-subscribe-bell/thumbnail.png" width="128" alt=""> | **Like, subscribe, bell bar** `sub-like-subscribe-bell`<br>A bar with a thumbs-up, a subscribe button and a bell, tapped one after another.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: whoosh @ 0 s, pop @ 0.93 s, click @ 1.8 s, ding @ 2.67 s | 4 s | Button `#E53935`<br>Subscribed & circles `#3A3F4B`<br>Text & icons `#FFFFFF`<br>Liked `#4C8DFF`<br>Burst `#F5A524`<br>Bar `#0F1115` |
| <img src="subscribe-buttons/sub-bounce-pop/thumbnail.png" width="128" alt=""> | **Bounce pop** `sub-bounce-pop`<br>The subscribe button drops in, squashes on landing and bounces to rest with a spark.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: pop @ 0.47 s | 2.5 s | Button `#E53935`<br>Text `#FFFFFF`<br>Sparks `#F5A524`<br>Shadow `#0F1115` |
| <img src="subscribe-buttons/sub-slide-shine/thumbnail.png" width="128" alt=""> | **Slide-in shine** `sub-slide-shine`<br>The button slides in from the left and a light sweep runs across it.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: whoosh @ 0 s | 3 s | Button `#E53935`<br>Text `#FFFFFF`<br>Shine `#F4F6FA`<br>Shadow `#0F1115` |
| <img src="subscribe-buttons/sub-neon-glow/thumbnail.png" width="128" alt=""> | **Neon glow** `sub-neon-glow`<br>A neon outline button that flickers on and pulses its glow.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: pop @ 0.13 s | 3 s, loops | Neon `#FF4D6D`<br>Core & text `#FFFFFF`<br>Background `#0F1115` |
| <img src="subscribe-buttons/sub-ghost-outline/thumbnail.png" width="128" alt=""> | **Ghost outline** `sub-ghost-outline`<br>A minimal outline button draws itself, then fills from the left.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: whoosh @ 0 s, pop @ 1.4 s | 2.5 s | Button & outline `#E53935`<br>Filled text `#FFFFFF`<br>Shadow `#0F1115` |
| <img src="subscribe-buttons/sub-glass/thumbnail.png" width="128" alt=""> | **Frosted glass** `sub-glass`<br>A frosted-glass button over drifting colour blobs; pressed, it switches to “Subscribed”.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: pop @ 0 s, click @ 1.47 s | 3 s | Blob 1 `#E53935`<br>Blob 2 `#4C8DFF`<br>Glass & text `#FFFFFF`<br>Shadow `#0F1115` |
| <img src="subscribe-buttons/sub-avatar-bar/thumbnail.png" width="128" alt=""> | **Channel bar** `sub-avatar-bar`<br>A channel bar with an empty avatar circle and name placeholder (cover them with your own picture and text) and a subscribe button that gets clicked.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: whoosh @ 0 s, pop @ 0.6 s, click @ 1.93 s | 3.5 s | Bar `#0F1115`<br>Avatar & name area `#596070`<br>Avatar ring `#F5A524`<br>Button `#E53935`<br>Subscribed button `#3A3F4B`<br>Text `#FFFFFF` |
| <img src="subscribe-buttons/sub-cursor-click/thumbnail.png" width="128" alt=""> | **Cursor click** `sub-cursor-click`<br>A mouse cursor glides in and clicks the subscribe button with a ripple — sized for vertical, mobile and Shorts videos.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: pop @ 0 s, click @ 1.33 s | 3 s | Button `#E53935`<br>Subscribed button `#3A3F4B`<br>Text `#FFFFFF`<br>Cursor `#F4F6FA`<br>Cursor outline & shadow `#0F1115`<br>Click ripple `#F5A524` |
| <img src="subscribe-buttons/sub-glitch/thumbnail.png" width="128" alt=""> | **Glitch** `sub-glitch`<br>A subscribe button that glitches in with RGB-split jumps.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: whoosh @ 0.2 s | 2.5 s | Button `#E53935`<br>Text `#FFFFFF`<br>Split 1 `#00E5FF`<br>Split 2 `#FF2DAA` |
| <img src="subscribe-buttons/sub-3d-press/thumbnail.png" width="128" alt=""> | **3D press** `sub-3d-press`<br>A raised button that sinks into its base when pressed and stays down as “Subscribed”.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: pop @ 0 s, click @ 1 s | 2.5 s | Button `#E53935`<br>Button side `#9E1F1C`<br>Subscribed button `#3A3F4B`<br>Subscribed side `#262A33`<br>Text `#FFFFFF`<br>Shadow `#0F1115` |
| <img src="subscribe-buttons/sub-countdown/thumbnail.png" width="128" alt=""> | **Countdown end screen** `sub-countdown`<br>A 3-2-1 countdown runs around the button, then it clicks to “Subscribed”. Made for end screens.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: click @ 0.33 s, click @ 1.33 s, click @ 2.33 s, click @ 3.33 s, ding @ 3.43 s | 4 s | Button `#E53935`<br>Subscribed button `#3A3F4B`<br>Text `#FFFFFF`<br>Ring & digits `#F5A524`<br>Track & badge `#0F1115` |
| <img src="subscribe-buttons/bell-notifications-on/thumbnail.png" width="128" alt=""> | **Notifications on** `bell-notifications-on`<br>A crossed-out bell loses its slash, fills in, rings and gets a dot: “turn on notifications” without words.<br>Sounds: click @ 1.47 s, ding @ 1.53 s | 3 s | Bell `#FFFFFF`<br>Circle `#0F1115`<br>Burst `#F5A524`<br>Dot `#E53935` |
| <img src="subscribe-buttons/sub-join-pair/thumbnail.png" width="128" alt=""> | **Subscribe + join** `sub-join-pair`<br>A subscribe button and a member “Join” button pop in side by side; subscribe is clicked, join sparkles.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: pop @ 0.27 s, click @ 1.2 s, confetti @ 2.13 s | 3.5 s | Button `#E53935`<br>Subscribed button `#3A3F4B`<br>Text `#FFFFFF`<br>Join button `#4C8DFF`<br>Sparkle `#F5A524`<br>Shadow `#0F1115` |
| <img src="subscribe-buttons/sub-sticker-confetti/thumbnail.png" width="128" alt=""> | **Sticker with confetti** `sub-sticker-confetti`<br>A tilted sticker-style subscribe badge slaps on with a burst of confetti.<br>Languages: English, සිංහල, தமிழ்<br>Sounds: pop @ 0.2 s, confetti @ 0.2 s | 3 s | Button `#E53935`<br>Text `#FFFFFF`<br>Sticker edge `#F4F6FA`<br>Shadow `#0F1115`<br>Confetti 1 `#F5A524`<br>Confetti 2 `#4C8DFF`<br>Confetti 3 `#2EC4B6` |
