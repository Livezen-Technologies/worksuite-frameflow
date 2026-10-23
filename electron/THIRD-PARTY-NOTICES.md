# Third-party notices: LGPL components

Worksuite FrameFlow includes these libraries under the GNU Lesser General
Public License. You may replace each of them with your own modified version,
as described below. The full licence texts ship in this folder and next to
each component.

## libheif (HEIC/HEIF photo import)

- Package: libheif-js 1.17.1 (libheif with the libde265 HEVC decoder,
  compiled to WebAssembly)
- Licence: LGPL-3.0 (libheif) and LGPL-3.0 (libde265); see
  `libheif-js-LGPL-3.0.txt`
- Source: https://github.com/catdad-experiments/libheif-js,
  https://github.com/strukturag/libheif, https://github.com/strukturag/libde265
- Where it is: `resources/web/apps/web/public/vendor/libheif/libheif-bundle.mjs`
  (on macOS inside `Worksuite FrameFlow.app/Contents/Resources/...`)
- To replace it: build libheif-js from source and put your
  `libheif-bundle.mjs` in that location. The app loads it from there at run
  time; it is not compiled into the app's own code.

## FFmpeg (editing proxies)

- Build: FFmpeg LGPL build (no GPL or non-free parts), from
  https://github.com/BtbN/FFmpeg-Builds; `resources/ffmpeg/BUILD.txt` lists the
  exact version and configuration
- Licence: LGPL-3.0; see `resources/ffmpeg/FFMPEG-LICENSE.txt`
- Source: https://ffmpeg.org/download.html and the build scripts at
  https://github.com/BtbN/FFmpeg-Builds
- Where it is: `resources/ffmpeg/ffmpeg` (`ffmpeg.exe` on Windows)
- To replace it: put your own `ffmpeg` executable in that location. The app runs it as a separate
  program and does not link to it.

## Written offer

On request, Livezen Technologies (support@worksuitecloud.com) will provide the complete
corresponding source code of these components, as shipped, for at least three
years after the last release that includes them, for no more than the cost
of providing it.

## Other data files

### Sinhala and Tamil word lists (typing suggestions and spell check)

- Where they are: `resources/web/apps/web/public/dictionaries/si.txt` and
  `ta.txt`, with `LICENSE.md` beside them.
- `si.txt`: from FrequencyWords by Hermit Dave
  (https://github.com/hermitdave/FrequencyWords), built from OpenSubtitles.
  Licence: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/),
  covering that file only.
- `ta.txt`: from open-tamil by the Ezhil Language Foundation
  (https://github.com/Ezhil-Language-Foundation/open-tamil). Licence: MIT.
- Either file can be replaced with a list in the same format (one word per
  line).

## Other components

### lottie-web (animations)

- Package: lottie-web 5.12.2 (https://github.com/airbnb/lottie-web), the
  canvas player; it draws the Animations library and imported Lottie files
- Licence: MIT

```
The MIT License (MIT)

Copyright (c) 2015 Bodymovin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The Worksuite Assets animations themselves are original to Worksuite
FrameFlow, generated from code in `scripts/assets/`, and MIT licensed like
the rest of the repository.
