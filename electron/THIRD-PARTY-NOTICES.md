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
