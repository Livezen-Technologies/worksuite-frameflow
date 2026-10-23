// Floating recording controls (SRS SC-04). Talks to the editor through the
// bar's preload; the window is excluded from screen capture.
const $ = (id) => document.getElementById(id);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
for (const id of ["pause", "marker", "mic", "discard", "stop"]) {
	$(id).addEventListener("click", () => window.captureBar.send(id === "pause" ? "toggle-pause" : id === "mic" ? "toggle-mic" : id));
}
window.captureBar.onState((state) => {
	$("time").textContent = state.countdown ? `Starting ${state.countdown}` : fmt(state.elapsed ?? 0);
	$("bar").classList.toggle("paused", !!state.paused);
	$("pause").textContent = state.paused ? "Resume" : "Pause";
	$("mic").textContent = state.micMuted ? "Mic off" : "Mic on";
	$("mic").classList.toggle("on", !state.micMuted);
});
