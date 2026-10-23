# DJI LUT accuracy fixtures (SRS WS-48)

`src/lut/__tests__/dji-accuracy.test.ts` checks that FrameFlow applies a
camera LUT within ΔE 2000 < 2 of the camera maker's own result. Each case is
a folder here:

```
fixtures/dji/<case>/
  lut.cube        DJI's D-Log M to Rec.709 LUT for that camera
  log.ppm         one frame of the original D-Log M clip
  reference.ppm   the same frame with DJI's LUT applied by DJI's tool
                  (or DaVinci Resolve), exported as 8-bit RGB
```

Make the PPM frames with ffmpeg, at the same time in both clips:

```
ffmpeg -ss 2 -i original.mp4 -frames:v 1 -pix_fmt rgb24 log.ppm
ffmpeg -ss 2 -i graded-by-dji.mp4 -frames:v 1 -pix_fmt rgb24 reference.ppm
```

The SRS asks for at least one DJI drone (e.g. Mini 4 Pro, Air 3) and one
Osmo camera (e.g. Osmo Pocket 3, Action 4). DJI's LUTs and sample footage
can't be committed without DJI's permission, so this folder only holds this
note until they're added; the test skips when it finds no cases.
