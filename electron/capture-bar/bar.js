// Floating recording controls (SRS SC-04). Talks to the editor through the
// bar's preload; the window is excluded from screen capture.
const $ = (id) => document.getElementById(id);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const COMMAND = { pause: "toggle-pause", mic: "toggle-mic", camera: "toggle-camera", pen: "toggle-pen", clear: "clear-pen" };
for (const id of ["pause", "marker", "mic", "camera", "pen", "clear", "discard", "stop"]) {
	$(id).addEventListener("click", () => window.captureBar.send(COMMAND[id] ?? id));
}
window.captureBar.onState((state) => {
	$("time").textContent = state.countdown ? `Starting ${state.countdown}` : fmt(state.elapsed ?? 0);
	$("bar").classList.toggle("paused", !!state.paused);
	$("pause").textContent = state.paused ? "Resume" : "Pause";
	$("mic").textContent = state.micMuted ? "Mic off" : "Mic on";
	$("mic").classList.toggle("on", !state.micMuted);
	$("camera").hidden = state.cameraOff === null || state.cameraOff === undefined;
	$("camera").textContent = state.cameraOff ? "Cam off" : "Cam on";
	$("camera").classList.toggle("on", !state.cameraOff);
	$("pen").classList.toggle("on", !!state.pen);
	$("clear").hidden = !state.pen;
});
