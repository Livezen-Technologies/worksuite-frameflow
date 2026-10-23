"use client";

import { useRef } from "react";
import { useEditor } from "@/editor/use-editor";
import { cameraAtPlayhead, type CameraTarget, setCamera } from "./camera";
import { dragToAngles, findReframeEffect } from "./projection";

/**
 * Drag the preview to aim the selected 360° clip's camera and scroll to
 * zoom (VR-06, VR-09). Values go through `setCamera`, so an animated value
 * gets a keyframe at the playhead.
 */
export function useSphereDrag({ target }: { target: CameraTarget | null }) {
	const editor = useEditor();
	const drag = useRef<{
		x: number;
		y: number;
		yaw: number;
		pitch: number;
		fov: number;
		target: CameraTarget;
	} | null>(null);
	const active = !!target && !!findReframeEffect(target.element.effects);

	const onPointerDown = (event: React.PointerEvent): boolean => {
		if (!active || !target || event.button !== 0) return false;
		const start = cameraAtPlayhead({ editor, element: target.element });
		drag.current = {
			x: event.clientX,
			y: event.clientY,
			yaw: start.yaw,
			pitch: start.pitch,
			fov: start.fov,
			target,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
		return true;
	};

	const onPointerMove = (event: React.PointerEvent): boolean => {
		const d = drag.current;
		if (!d) return false;
		const turn = dragToAngles({
			dx: event.clientX - d.x,
			dy: event.clientY - d.y,
			viewHeight: event.currentTarget.getBoundingClientRect().height,
			fov: d.fov,
		});
		const sphere =
			findReframeEffect(d.target.element.effects)?.params.mode === "sphere";
		setCamera({
			editor,
			target: d.target,
			values: {
				yaw: d.yaw + (sphere ? -turn.yaw : turn.yaw),
				pitch: Math.max(
					-90,
					Math.min(90, d.pitch + (sphere ? -turn.pitch : turn.pitch)),
				),
			},
			preview: true,
		});
		return true;
	};

	const onPointerUp = (): boolean => {
		if (!drag.current) return false;
		drag.current = null;
		editor.timeline.commitPreview();
		return true;
	};

	const onWheel = (event: React.WheelEvent): void => {
		if (!active || !target) return;
		const { fov } = cameraAtPlayhead({ editor, element: target.element });
		setCamera({
			editor,
			target,
			values: {
				fov: Math.max(20, Math.min(300, fov * Math.exp(event.deltaY * 0.001))),
			},
		});
	};

	return { active, onPointerDown, onPointerMove, onPointerUp, onWheel };
}
