// Draw-on-screen pen (SRS SC-04). The ink is part of the recording.
const canvas = document.getElementById("ink");
const ctx = canvas.getContext("2d");
const COLORS = ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#ffffff"];
let color = COLORS[0];
let last = null;

function resize() {
	const ratio = window.devicePixelRatio || 1;
	const image = canvas.width ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
	canvas.width = innerWidth * ratio;
	canvas.height = innerHeight * ratio;
	canvas.style.width = `${innerWidth}px`;
	canvas.style.height = `${innerHeight}px`;
	ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
	if (image) ctx.putImageData(image, 0, 0);
}
resize();
addEventListener("resize", resize);

const palette = document.getElementById("colors");
for (const c of COLORS) {
	const b = document.createElement("button");
	b.style.background = c;
	b.title = "Pen colour";
	b.className = c === color ? "on" : "";
	b.addEventListener("click", () => {
		color = c;
		for (const other of palette.children) other.className = other === b ? "on" : "";
	});
	palette.append(b);
}

canvas.addEventListener("pointerdown", (e) => {
	canvas.setPointerCapture(e.pointerId);
	last = [e.clientX, e.clientY];
});
canvas.addEventListener("pointermove", (e) => {
	if (!last) return;
	ctx.strokeStyle = color;
	ctx.lineWidth = 4;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.beginPath();
	ctx.moveTo(last[0], last[1]);
	ctx.lineTo(e.clientX, e.clientY);
	ctx.stroke();
	last = [e.clientX, e.clientY];
});
const end = () => {
	last = null;
};
canvas.addEventListener("pointerup", end);
canvas.addEventListener("pointercancel", end);
const clear = () => ctx.clearRect(0, 0, canvas.width, canvas.height);
window.pen.onClear(clear);
addEventListener("keydown", (e) => {
	if (e.key === "Escape") window.pen.close();
	else if (e.key === "Delete" || e.key === "Backspace") clear();
});
