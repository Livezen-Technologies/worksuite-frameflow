#!/usr/bin/env bash
# Builds an LGPL-only, self-contained FFmpeg for macOS for the desktop app's
# media helper (proxies, conversions; SRS PS-12–PS-16). Run on a Mac of the
# target architecture (CI: .github/workflows/ffmpeg-macos.yml).
#
#   scripts/build-ffmpeg-macos.sh <out-dir>
#
# Encoders the helper uses: libkvazaar (HEVC, BSD-3), libopenh264 (H.264,
# BSD-2), libsvtav1 (AV1, BSD-2), libmp3lame (LGPL), plus FFmpeg's own AAC,
# FLAC, ProRes and PCM and Apple's VideoToolbox. Everything is linked
# statically, so the binary only needs macOS's own libraries. GPL and
# non-free code are never enabled; the result is checked before packing.
set -euo pipefail

OUT="${1:?usage: build-ffmpeg-macos.sh <out-dir>}"
ARCH="$(uname -m)" # arm64 or x86_64
export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-11.0}"

FFMPEG_VERSION=7.1.1
LAME_VERSION=3.100
OPENH264_VERSION=2.5.0
KVAZAAR_VERSION=2.3.1
SVTAV1_VERSION=2.3.0

WORK="$(mktemp -d)"
PREFIX="$WORK/prefix"
mkdir -p "$PREFIX" "$OUT"
# Only our own libraries: Homebrew's (X11, xcb…) exist on CI runners but
# not on users' Macs, so pkg-config must not find them.
export PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig"
unset PKG_CONFIG_PATH
JOBS="$(sysctl -n hw.ncpu)"
cd "$WORK"

fetch() { curl -fsSL --retry 4 "$1" -o "$2"; }

echo "::group::lame $LAME_VERSION"
fetch "https://downloads.sourceforge.net/project/lame/lame/$LAME_VERSION/lame-$LAME_VERSION.tar.gz" lame.tgz
tar -xzf lame.tgz
# lame 3.100 exports a symbol that no longer exists; drop it so it links.
sed -i '' '/lame_init_old/d' "lame-$LAME_VERSION/include/libmp3lame.sym"
(cd "lame-$LAME_VERSION" && ./configure --prefix="$PREFIX" --enable-static --disable-shared --disable-frontend --disable-decoder && make -j"$JOBS" && make install)
echo "::endgroup::"

echo "::group::openh264 $OPENH264_VERSION"
fetch "https://github.com/cisco/openh264/archive/refs/tags/v$OPENH264_VERSION.tar.gz" openh264.tgz
tar -xzf openh264.tgz
(cd "openh264-$OPENH264_VERSION" && make -j"$JOBS" OS=darwin ARCH="$ARCH" PREFIX="$PREFIX" install-static)
echo "::endgroup::"

echo "::group::kvazaar $KVAZAAR_VERSION"
fetch "https://github.com/ultravideo/kvazaar/releases/download/v$KVAZAAR_VERSION/kvazaar-$KVAZAAR_VERSION.tar.xz" kvazaar.txz
tar -xJf kvazaar.txz
(cd "kvazaar-$KVAZAAR_VERSION" && ./configure --prefix="$PREFIX" --enable-static --disable-shared && make -j"$JOBS" && make install)
echo "::endgroup::"

echo "::group::SVT-AV1 $SVTAV1_VERSION"
fetch "https://gitlab.com/AOMediaCodec/SVT-AV1/-/archive/v$SVTAV1_VERSION/SVT-AV1-v$SVTAV1_VERSION.tar.gz" svtav1.tgz
tar -xzf svtav1.tgz
cmake -S "SVT-AV1-v$SVTAV1_VERSION" -B svtav1-build -G Ninja \
	-DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$PREFIX" -DCMAKE_INSTALL_LIBDIR=lib \
	-DBUILD_SHARED_LIBS=OFF -DBUILD_APPS=OFF -DBUILD_TESTING=OFF \
	-DCMAKE_POLICY_VERSION_MINIMUM=3.5 # its bundled cpuinfo predates CMake 4
cmake --build svtav1-build -j"$JOBS"
cmake --install svtav1-build
echo "::endgroup::"

echo "::group::FFmpeg $FFMPEG_VERSION"
fetch "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" ffmpeg.txz
tar -xJf ffmpeg.txz
cd "ffmpeg-$FFMPEG_VERSION"
# No --enable-gpl, --enable-version3 or --enable-nonfree: the result is LGPL 2.1+.
# --disable-autodetect: nothing is picked up from the build machine; only the
# libraries named here, plus macOS's own frameworks and zlib, are used.
./configure \
	--prefix="$PREFIX" \
	--pkg-config-flags=--static \
	--extra-cflags="-I$PREFIX/include" \
	--extra-ldflags="-L$PREFIX/lib" \
	--enable-static --disable-shared \
	--disable-autodetect \
	--disable-ffplay --disable-doc --disable-debug \
	--enable-libmp3lame --enable-libopenh264 --enable-libkvazaar --enable-libsvtav1 \
	--enable-videotoolbox --enable-audiotoolbox --enable-zlib
make -j"$JOBS"
echo "::endgroup::"

echo "::group::Check"
CONF="$(./ffmpeg -hide_banner -buildconf)"
if grep -Eq -- '--enable-(gpl|nonfree)\b' <<<"$CONF"; then
	echo "This build enables GPL or non-free code; refusing it." >&2
	exit 1
fi
# Only macOS's own libraries may be linked dynamically.
if otool -L ./ffmpeg | tail -n +2 | grep -vE '^\s*(/usr/lib/|/System/Library/)'; then
	echo "ffmpeg links a library outside macOS (listed above); refusing it." >&2
	exit 1
fi
for enc in libkvazaar libopenh264 libsvtav1 libmp3lame h264_videotoolbox hevc_videotoolbox prores_ks aac flac; do
	./ffmpeg -hide_banner -h encoder="$enc" | grep -q "^Encoder $enc" || { echo "Missing encoder $enc" >&2; exit 1; }
done
echo "::endgroup::"

case "$ARCH" in arm64) NAME=ffmpeg-darwin-arm64 ;; x86_64) NAME=ffmpeg-darwin-x64 ;; *) echo "Unknown arch $ARCH" >&2; exit 1 ;; esac
STAGE="$WORK/$NAME"
mkdir -p "$STAGE"
cp ffmpeg "$STAGE/ffmpeg"
cp COPYING.LGPLv2.1 "$STAGE/LICENSE.txt"
{
	echo "FFmpeg $FFMPEG_VERSION for macOS $ARCH (minimum macOS $MACOSX_DEPLOYMENT_TARGET), LGPL 2.1 or later."
	echo "Built by scripts/build-ffmpeg-macos.sh from these sources:"
	echo "  https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz"
	echo "  lame $LAME_VERSION (LGPL): https://downloads.sourceforge.net/project/lame/lame/$LAME_VERSION/lame-$LAME_VERSION.tar.gz"
	echo "  openh264 $OPENH264_VERSION (BSD-2): https://github.com/cisco/openh264/archive/refs/tags/v$OPENH264_VERSION.tar.gz"
	echo "  kvazaar $KVAZAAR_VERSION (BSD-3): https://github.com/ultravideo/kvazaar/releases/tag/v$KVAZAAR_VERSION"
	echo "  SVT-AV1 $SVTAV1_VERSION (BSD-2 + AOM patent licence): https://gitlab.com/AOMediaCodec/SVT-AV1/-/tags/v$SVTAV1_VERSION"
	echo
	echo "$CONF"
} >"$STAGE/BUILD.txt"
(cd "$WORK" && zip -qr "$OUT/$NAME.zip" "$NAME")
shasum -a 256 "$OUT/$NAME.zip"
rm -rf "$WORK"
