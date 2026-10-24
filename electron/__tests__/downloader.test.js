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
