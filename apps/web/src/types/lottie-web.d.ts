// lottie-web ships typings for its main entry only; the canvas-only build
// exposes the same player.
declare module "lottie-web/build/player/lottie_canvas" {
	import type { LottiePlayer } from "lottie-web";
	const lottie: LottiePlayer;
	export default lottie;
}
