// lottie-web ships typings for its main entry only; the canvas-only build
// exposes the same player.
declare module "lottie-web/build/player/lottie_canvas" {
	import type { LottiePlayer } from "lottie-web";
	const lottie: LottiePlayer;
	export default lottie;
}

// The SVG-only light build (no expression engine), used for the brand loader.
declare module "lottie-web/build/player/lottie_light" {
	import type { LottiePlayer } from "lottie-web";
	const lottie: LottiePlayer;
	export default lottie;
}
