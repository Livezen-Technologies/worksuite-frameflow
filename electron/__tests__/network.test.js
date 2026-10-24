const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

// network.js reads `app` from electron only when settings are touched.
const original = Module._load;
Module._load = function (request, ...rest) {
	if (request === "electron") return { app: { getPath: () => "/tmp" } };
	return original.call(this, request, ...rest);
};
const { connectionKind } = require("../network");
Module._load = original;

const up = [{ internal: false, family: "IPv4", address: "10.0.0.2" }];
const down = [{ internal: false, family: "IPv6", address: "fe80::1" }];

test("mobile data alone counts as cellular", () => {
	assert.equal(connectionKind({ lo: [{ internal: true, family: "IPv4" }], wwan0: up }), "cellular");
	assert.equal(connectionKind({ "Cellular": up }), "cellular");
	assert.equal(connectionKind({ usb0: up, docker0: up }), "cellular");
});

test("Wi-Fi or Ethernet anywhere counts as unmetered", () => {
	assert.equal(connectionKind({ wlan0: up, wwan0: up }), "wifi-or-ethernet");
	assert.equal(connectionKind({ "Wi-Fi": up }), "wifi-or-ethernet");
	assert.equal(connectionKind({ en0: up }), "wifi-or-ethernet");
	assert.equal(connectionKind({ eth0: down }), "offline");
});
