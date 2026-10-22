import type { Effect } from "@/effects/types";
import { LUT_EFFECT_TYPE } from "@/effects/definitions/lut";

/** Camera LUT effects carry this id prefix and always come first (WS-37). */
export const CAMERA_LUT_PREFIX = "camlut-";

export function isCameraLutEffect(effect: Effect): boolean {
	return (
		effect.type === LUT_EFFECT_TYPE && effect.id.startsWith(CAMERA_LUT_PREFIX)
	);
}

export function readCameraLut(
	effects: Effect[] | undefined,
): { lutId: string; intensity: number } | null {
	const effect = (effects ?? []).find(isCameraLutEffect);
	if (!effect) return null;
	return {
		lutId: String(effect.params.lutId ?? ""),
		intensity:
			typeof effect.params.intensity === "number"
				? effect.params.intensity
				: 100,
	};
}

/** Effects with the camera LUT set (or removed with `lutId: null`), placed first. */
export function withCameraLut({
	effects,
	lutId,
	intensity = 100,
	makeId,
}: {
	effects: Effect[] | undefined;
	lutId: string | null;
	intensity?: number;
	makeId: () => string;
}): Effect[] {
	const rest = (effects ?? []).filter((e) => !isCameraLutEffect(e));
	if (!lutId) return rest;
	return [
		{
			id: `${CAMERA_LUT_PREFIX}${makeId()}`,
			type: LUT_EFFECT_TYPE,
			enabled: true,
			params: { lutId, intensity },
		},
		...rest,
	];
}

/** A creative LUT goes after the grade, at the end of the stack. */
export function withCreativeLut({
	effects,
	lutId,
	intensity = 100,
	makeId,
}: {
	effects: Effect[] | undefined;
	lutId: string;
	intensity?: number;
	makeId: () => string;
}): Effect[] {
	return [
		...(effects ?? []),
		{
			id: makeId(),
			type: LUT_EFFECT_TYPE,
			enabled: true,
			params: { lutId, intensity },
		},
	];
}
