import { LOTTIE_GRAPHIC_DEFINITION_ID } from "@/lottie/types";
import type { GraphicDefinition } from "../types";

/**
 * Animation (Lottie) graphics. The element's `lottie` field says which
 * animation and colours; the renderer's LottieNode draws it frame by frame,
 * so this definition has no params and draws nothing on its own.
 */
export const lottieGraphicDefinition: GraphicDefinition = {
	id: LOTTIE_GRAPHIC_DEFINITION_ID,
	name: "Animation",
	keywords: ["animation", "lottie", "motion graphic"],
	hidden: true,
	params: [],
	render({ ctx, width, height }) {
		ctx.clearRect(0, 0, width, height);
	},
};
