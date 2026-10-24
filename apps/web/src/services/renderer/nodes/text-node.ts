import type { ProjectionDescriptor } from "@/vr/projection";
import { BaseNode } from "./base-node";
import type { TextElement } from "@/timeline";
import type { EffectPass } from "@/effects/types";
import type { BlendMode, Transform } from "@/rendering";
import { drawMeasuredTextLayout } from "@/text/primitives";
import { renderAnimatedText } from "@/text-animation/render";
import { styleFromResolvedText } from "@/text-animation/element-style";
import type { MeasuredTextElement } from "@/text/measure-element";
import type { TextStyleEffects } from "@/text/style";

export type TextNodeParams = TextElement & {
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	canvasCenter: { x: number; y: number };
	canvasHeight: number;
	textBaseline?: CanvasTextBaseline;
};

export interface ResolvedTextNodeState {
	transform: Transform;
	opacity: number;
	textColor: string;
	backgroundColor: string;
	effectPasses: EffectPass[][];
	/** Pinned to the 360° sphere (VR-17). */
	projection?: ProjectionDescriptor;
	measuredText: MeasuredTextElement;
	styleEffects?: TextStyleEffects;
	/** Seconds into the clip and its length, for the text animation. */
	textAnimationTime?: { time: number; duration: number };
}

export class TextNode extends BaseNode<TextNodeParams, ResolvedTextNodeState> {}

export function renderTextToContext({
	node,
	ctx,
}: {
	node: TextNode;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): void {
	const resolved = node.resolved;
	if (!resolved) {
		return;
	}

	const x = resolved.transform.position.x + node.params.canvasCenter.x;
	const y = resolved.transform.position.y + node.params.canvasCenter.y;
	const baseline = node.params.textBaseline ?? "middle";

	ctx.save();
	ctx.translate(x, y);
	ctx.scale(resolved.transform.scaleX, resolved.transform.scaleY);
	if (resolved.transform.rotate) {
		ctx.rotate((resolved.transform.rotate * Math.PI) / 180);
	}

	const animation = node.params.textAnimation;
	if (animation && resolved.textAnimationTime) {
		const layout = resolved.measuredText;
		renderAnimatedText({
			ctx,
			text: layout.lines.join("\n"),
			animation,
			time: resolved.textAnimationTime.time,
			duration: resolved.textAnimationTime.duration,
			style: styleFromResolvedText({
				params: node.params.params,
				scaledFontSize: layout.scaledFontSize,
				letterSpacingPx: layout.letterSpacing,
				lineHeightPx: layout.lineHeightPx,
				textAlign: layout.textAlign,
				textColor: resolved.textColor,
				styleEffects: resolved.styleEffects,
				background: layout.resolvedBackground,
				backgroundColor: resolved.backgroundColor,
				overrides: node.params.textStyle,
			}),
		});
		ctx.restore();
		return;
	}

	drawMeasuredTextLayout({
		ctx,
		layout: resolved.measuredText,
		textColor: resolved.textColor,
		background: resolved.measuredText.resolvedBackground,
		backgroundColor: resolved.backgroundColor,
		textBaseline: baseline,
		styleEffects: resolved.styleEffects,
	});

	ctx.restore();
}
