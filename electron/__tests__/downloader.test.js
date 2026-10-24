const test = require("node:test");
const assert = require("node:assert");
const { _test } = require("../downloader");

test("finds og:video on a page", () => {
	const html = '<meta property="og:video" content="/media/clip.mp4">';
	assert.equal(_test.findVideoInPage(html, "https://example.com/watch/1"), "https://example.com/media/clip.mp4");
});

test("finds a <video> src", () => {
	assert.equal(_test.findVideoInPage('<video src="https://cdn.example.com/a.webm">', "https://x.com"), "https://cdn.example.com/a.webm");
});

test("no video on a plain page", () => {
	assert.equal(_test.findVideoInPage("<p>hello</p>", "https://x.com"), null);
});

test("names files from the link or type", () => {
	assert.equal(_test.fileNameFor({ url: "https://x.com/v/My%20Clip.mp4", type: "video/mp4" }), "My Clip.mp4");
	assert.equal(_test.fileNameFor({ url: "https://x.com/stream", type: "video/webm" }), "stream.webm");
});

test("recognises media", () => {
	assert.ok(_test.isMedia("video/mp4", "https://x.com/a"));
	assert.ok(_test.isMedia("application/octet-stream", "https://x.com/a.mov?x=1"));
	assert.ok(!_test.isMedia("text/html", "https://x.com/page"));
});

test("refuses DRM streams and allows plain AES-128 HLS", () => {
	assert.match(_test.drmReason('#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://x",KEYFORMAT="com.apple.streamingkeydelivery"', "hls"), /FairPlay/);
	assert.match(_test.drmReason('#EXT-X-KEY:METHOD=SAMPLE-AES-CTR,KEYFORMAT="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"', "hls"), /Widevine/);
	assert.equal(_test.drmReason('#EXT-X-KEY:METHOD=AES-128,URI="key.bin"', "hls"), null);
	assert.match(_test.drmReason("<MPD><ContentProtection schemeIdUri=\"x\"/></MPD>", "dash"), /DRM/);
	assert.equal(_test.drmReason("<MPD></MPD>", "dash"), null);
});

test("reads HLS quality choices, best first, and duration", () => {
	const master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\nhi/index.m3u8\n";
	const v = _test.hlsVariants(master, "https://cdn.x.com/v/master.m3u8");
	assert.deepEqual(v.map((x) => x.label), ["1080p", "360p"]);
	assert.equal(v[0].url, "https://cdn.x.com/v/hi/index.m3u8");
	assert.equal(_test.hlsDuration("#EXTINF:4.0,\na.ts\n#EXTINF:2.5,\nb.ts\n"), 6.5);
});

test("page title and stream kinds", () => {
	assert.equal(_test.pageTitle('<meta property="og:title" content="My &amp; Clip"><title>x</title>'), "My & Clip");
	assert.equal(_test.streamKind("application/vnd.apple.mpegurl", "https://x/a"), "hls");
	assert.equal(_test.streamKind("", "https://x/a.mpd?t=1"), "dash");
	assert.equal(_test.streamKind("video/mp4", "https://x/a.mp4"), null);
});

test("turns cloud share links into direct downloads", () => {
	const drive = _test.resolveShareLink("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing");
	assert.equal(drive.source, "Google Drive");
	assert.equal(drive.url, "https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOp&export=download&confirm=t");
	const box = _test.resolveShareLink("https://www.dropbox.com/scl/fi/abc/clip.mp4?rlkey=x&dl=0");
	assert.equal(box.source, "Dropbox");
	assert.match(box.url, /dl=1$/);
	assert.doesNotMatch(box.url, /dl=0/);
	const one = _test.resolveShareLink("https://1drv.ms/v/s!AbC");
	assert.equal(one.source, "OneDrive");
	assert.match(one.url, /^https:\/\/api\.onedrive\.com\/v1\.0\/shares\/u!aHR0cHM6Ly8xZHJ2Lm1zL3Yvcy[^=]*\/root\/content$/);
	assert.equal(_test.resolveShareLink("https://example.com/a.mp4").source, null);
});

test("finds subtitles on pages and in HLS, and converts WebVTT to SRT", () => {
	const page = '<video src="a.mp4"><track kind="captions" src="/subs/en.vtt" srclang="en"><track kind="chapters" src="c.vtt"></video>';
	assert.deepEqual(_test.pageSubtitles(page, "https://x.com/watch"), [{ url: "https://x.com/subs/en.vtt", lang: "en", format: "vtt" }]);
	const hls = '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="s",NAME="Sinhala",LANGUAGE="si",URI="subs/si.m3u8"\n';
	assert.deepEqual(_test.hlsSubtitles(hls, "https://cdn.x.com/v/master.m3u8"), [{ url: "https://cdn.x.com/v/subs/si.m3u8", lang: "si", format: "hls" }]);
	const srt = _test.vttToSrt("WEBVTT\n\n00:01.000 --> 00:02.500 align:start\n<b>Hello</b>\n\n1\n01:00:03.000 --> 01:00:04.000\nWorld\n");
	assert.equal(srt, "1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n01:00:03,000 --> 01:00:04,000\nWorld\n");
});
