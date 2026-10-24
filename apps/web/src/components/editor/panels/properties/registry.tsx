import { TEXT_STYLE_PARAM_KEYS } from "@/text/style";
import type { ReactNode } from "react";
import type {
	EffectElement,
	GraphicElement,
	ImageElement,
	MaskableElement,
	RetimableElement,
	StickerElement,
	TextElement,
	VisualElement,
	VideoElement,
	AudioElement,
	TimelineElement,
} from "@/timeline";
import type { MediaAsset } from "@/media/types";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	TextFontIcon,
	ArrowExpandIcon,
	RainDropIcon,
	MusicNote03Icon,
	MagicWand05Icon,
	DashboardSpeed02Icon,
} from "@hugeicons/core-free-icons";
import { ElementParamsTab } from "./components/element-params-tab";
import {
	ClipEffectsTab,
	StandaloneEffectTab,
} from "@/effects/components/effects-tab";
import { MasksTab } from "@/masks/components/masks-tab";
import { SpeedTab } from "@/speed/components/speed-tab";
import { AudioBasicTab } from "@/audio-tools/components/audio-basic-tab";
import { VoiceChangerTab } from "@/audio-tools/components/voice-changer-tab";
import { GraphicTab } from "@/graphics/components/graphic-tab";
import { LottieTab } from "@/lottie/components/lottie-tab";
import { OcShapesIcon } from "@/components/icons";
import {
	Crosshair,
	Film,
	Globe,
	Sparkles,
	Type,
	Wand,
	ZoomIn,
	Clapperboard,
} from "lucide-react";
import { MulticamTab } from "@/multicam/components/multicam-tab";
import { ZoomTab } from "@/screen-zoom/components/zoom-tab";
import { TextBasicTab, TextPresetsTab } from "@/text/components/text-panel";
import { TrackingTab } from "@/text/components/tracking-tab";
import { TextAnimationTab } from "@/text-animation/components/text-animation-tab";
import { BasicTab } from "@/clip-actions/components/basic-tab";
import { AnimationTab } from "@/animation/components/animation-tab";
import { SpherePinTab, SphereTab } from "@/vr/components/sphere-tab";
import { findSpherePlaceEffect } from "@/vr/projection";
import { Mic, PaintBucket } from "lucide-react";
import { BackgroundContent } from "@/components/editor/panels/assets/views/settings/background";

const TRANSFORM_PARAM_KEYS = [
	"transform.positionX",
	"transform.positionY",
	"transform.scaleX",
	"transform.scaleY",
	"transform.rotate",
] as const;

const BLENDING_PARAM_KEYS = ["opacity", "blendMode"] as const;
const AUDIO_PARAM_KEYS = ["volume", "muted"] as const;
const TEXT_PARAM_KEYS = [
	"content",
	"fontFamily",
	"fontSize",
	"color",
	"textAlign",
	"fontWeight",
	"fontStyle",
	"textDecoration",
	"letterSpacing",
	"lineHeight",
	"background.enabled",
	"background.color",
	"background.cornerRadius",
	"background.paddingX",
	"background.paddingY",
	"background.offsetX",
	"background.offsetY",
	// Animation keys live in the Animation tab.
	...TEXT_STYLE_PARAM_KEYS.filter((key) => !key.startsWith("animation.")),
];

export type TabContentProps = {
	trackId: string;
};

export type PropertiesTabDef = {
	id: string;
	label: string;
	icon: ReactNode;
	content: (props: TabContentProps) => ReactNode;
};

export type ElementPropertiesConfig = {
	defaultTab: string;
	tabs: PropertiesTabDef[];
};

function buildTransformTab({
	element,
}: {
	element: VisualElement;
}): PropertiesTabDef {
	return {
		id: "transform",
		label: "Transform",
		icon: <HugeiconsIcon icon={ArrowExpandIcon} size={16} />,
		content: ({ trackId }) => (
			<ElementParamsTab
				element={element}
				trackId={trackId}
				paramKeys={TRANSFORM_PARAM_KEYS}
				sectionKey="transform"
			/>
		),
	};
}

function buildBlendingTab({
	element,
}: {
	element: VisualElement;
}): PropertiesTabDef {
	return {
		id: "blending",
		label: "Blending",
		icon: <HugeiconsIcon icon={RainDropIcon} size={16} />,
		content: ({ trackId }) => (
			<ElementParamsTab
				element={element}
				trackId={trackId}
				paramKeys={BLENDING_PARAM_KEYS}
				sectionKey="blending"
			/>
		),
	};
}

function buildAudioTab({
	element,
}: {
	element: AudioElement | VideoElement;
}): PropertiesTabDef {
	return {
		id: "audio",
		label: "Audio",
		icon: <HugeiconsIcon icon={MusicNote03Icon} size={16} />,
		content: ({ trackId }) => (
			<ElementParamsTab
				element={element}
				trackId={trackId}
				paramKeys={AUDIO_PARAM_KEYS}
				sectionKey="audio"
			/>
		),
	};
}

function buildSpeedTab({
	element,
}: {
	element: RetimableElement;
}): PropertiesTabDef {
	return {
		id: "speed",
		label: "Speed",
		icon: <HugeiconsIcon icon={DashboardSpeed02Icon} size={16} />,
		content: ({ trackId }) => <SpeedTab element={element} trackId={trackId} />,
	};
}

function buildMasksTab({
	element,
}: {
	element: MaskableElement;
}): PropertiesTabDef {
	return {
		id: "masks",
		label: "Masks",
		icon: <OcShapesIcon size={16} />,
		content: ({ trackId }) => <MasksTab element={element} trackId={trackId} />,
	};
}

function buildClipEffectsTab({
	element,
}: {
	element: VisualElement;
}): PropertiesTabDef {
	return {
		id: "effects",
		label: "Effects",
		icon: <HugeiconsIcon icon={MagicWand05Icon} size={16} />,
		content: ({ trackId }) => (
			<ClipEffectsTab element={element} trackId={trackId} />
		),
	};
}

function buildAnimationTab({
	element,
	thumbnail,
}: {
	element: TimelineElement;
	thumbnail?: string | null;
}): PropertiesTabDef {
	return {
		id: "animation",
		label: "Animation",
		icon: <Sparkles size={16} />,
		content: ({ trackId }) => (
			<AnimationTab element={element} trackId={trackId} thumbnail={thumbnail} />
		),
	};
}

function buildBasicTab({
	element,
}: {
	element: VisualElement;
}): PropertiesTabDef {
	return {
		id: "basic",
		label: "Basic",
		icon: <Film size={16} />,
		content: ({ trackId }) => <BasicTab element={element} trackId={trackId} />,
	};
}

/** The canvas behind the clip: colour, blur or a pattern (applies to the whole project). */
function buildBackgroundTab(): PropertiesTabDef {
	return {
		id: "background",
		label: "Background",
		icon: <PaintBucket size={16} />,
		content: () => (
			<div className="p-4" data-clip-background>
				<BackgroundContent />
			</div>
		),
	};
}

function buildSphereTab({
	element,
}: {
	element: VideoElement;
}): PropertiesTabDef {
	return {
		id: "sphere",
		label: "360°",
		icon: <Globe size={16} />,
		content: ({ trackId }) => <SphereTab element={element} trackId={trackId} />,
	};
}

/** Shown on titles and pictures pinned to the 360° sphere (VR-17). */
function buildSpherePinTabs({ element }: { element: VisualElement }): PropertiesTabDef[] {
	if (!findSpherePlaceEffect(element.effects)) return [];
	return [
		{
			id: "sphere-pin",
			label: "360°",
			icon: <Globe size={16} />,
			content: ({ trackId }) => <SpherePinTab element={element} trackId={trackId} />,
		},
	];
}

function buildTextTab({ element }: { element: TextElement }): PropertiesTabDef {
	return {
		id: "text",
		label: "All settings",
		icon: <HugeiconsIcon icon={TextFontIcon} size={16} />,
		content: ({ trackId }) => (
			<ElementParamsTab
				element={element}
				trackId={trackId}
				paramKeys={TEXT_PARAM_KEYS}
				sectionKey="text"
			/>
		),
	};
}

function buildGraphicTab({
	element,
}: {
	element: GraphicElement;
}): PropertiesTabDef {
	const { lottie } = element;
	return {
		id: "graphic",
		label: lottie ? "Animation" : "Graphic",
		icon: <OcShapesIcon size={16} />,
		content: ({ trackId }) =>
			lottie ? (
				<LottieTab element={{ ...element, lottie }} trackId={trackId} />
			) : (
				<GraphicTab element={element} trackId={trackId} />
			),
	};
}

function buildStandaloneEffectTab({
	element,
}: {
	element: EffectElement;
}): PropertiesTabDef {
	return {
		id: "effects",
		label: "Effects",
		icon: <HugeiconsIcon icon={MagicWand05Icon} size={16} />,
		content: ({ trackId }) => (
			<StandaloneEffectTab element={element} trackId={trackId} />
		),
	};
}

function getTextConfig({
	element,
}: {
	element: TextElement;
}): ElementPropertiesConfig {
	return {
		defaultTab: "basic",
		tabs: [
			{
				id: "presets",
				label: "Presets",
				icon: <Wand size={16} />,
				content: ({ trackId }) => (
					<TextPresetsTab element={element} trackId={trackId} />
				),
			},
			{
				id: "basic",
				label: "Basic",
				icon: <Type size={16} />,
				content: ({ trackId }) => (
					<TextBasicTab element={element} trackId={trackId} />
				),
			},
			buildAnimationTab({ element }),
			{
				id: "text-animate",
				label: "Animate text",
				icon: <Sparkles size={16} />,
				content: ({ trackId }) => (
					<TextAnimationTab element={element} trackId={trackId} />
				),
			},
			...buildSpherePinTabs({ element }),
			{
				id: "tracking",
				label: "Motion tracking",
				icon: <Crosshair size={16} />,
				content: ({ trackId }) => (
					<TrackingTab element={element} trackId={trackId} />
				),
			},
			buildTextTab({ element }),
		],
	};
}

function getVideoConfig({
	element,
	mediaAsset,
}: {
	element: VideoElement;
	mediaAsset: MediaAsset | undefined;
}): ElementPropertiesConfig {
	const showAudioTab = mediaAsset?.hasAudio !== false;
	return {
		defaultTab: element.multicam ? "multicam" : "basic",
		tabs: [
			buildBasicTab({ element }),
			buildBackgroundTab(),
			buildAnimationTab({ element, thumbnail: mediaAsset?.thumbnailUrl }),
			buildSpeedTab({ element }),
			...(showAudioTab
				? [
						buildAudioTab({ element }),
						{
							id: "voice",
							label: "Voice changer",
							icon: <Mic size={16} />,
							content: ({ trackId }: { trackId: string }) => (
								<VoiceChangerTab element={element} trackId={trackId} />
							),
						},
					]
				: []),
			buildTransformTab({ element }),
			buildSphereTab({ element }),
			buildBlendingTab({ element }),
			buildMasksTab({ element }),
			buildClipEffectsTab({ element }),
			buildZoomTab({ element }),
			...(element.multicam && element.multicam.role !== "audio"
				? [buildMulticamTab({ element })]
				: []),
		],
	};
}

function buildMulticamTab({
	element,
}: {
	element: VideoElement;
}): PropertiesTabDef {
	return {
		id: "multicam",
		label: "Multicam",
		icon: <Clapperboard size={16} />,
		content: () => <MulticamTab element={element} />,
	};
}

function buildZoomTab({
	element,
}: {
	element: VideoElement;
}): PropertiesTabDef {
	return {
		id: "zoom",
		label: "Zoom",
		icon: <ZoomIn size={16} />,
		content: ({ trackId }) => <ZoomTab element={element} trackId={trackId} />,
	};
}

function buildTrackingTab({ element }: { element: TimelineElement }): PropertiesTabDef {
	return {
		id: "tracking",
		label: "Motion tracking",
		icon: <Crosshair size={16} />,
		content: ({ trackId }) => <TrackingTab element={element} trackId={trackId} />,
	};
}

function getImageConfig({
	element,
	thumbnail,
}: {
	element: ImageElement;
	thumbnail?: string | null;
}): ElementPropertiesConfig {
	return {
		defaultTab: "basic",
		tabs: [
			buildBasicTab({ element }),
			buildBackgroundTab(),
			buildAnimationTab({ element, thumbnail }),
			buildTrackingTab({ element }),
			buildTransformTab({ element }),
			...buildSpherePinTabs({ element }),
			buildBlendingTab({ element }),
			buildMasksTab({ element }),
			buildClipEffectsTab({ element }),
		],
	};
}

function getStickerConfig({
	element,
}: {
	element: StickerElement;
}): ElementPropertiesConfig {
	return {
		defaultTab: "transform",
		tabs: [
			buildTransformTab({ element }),
			buildAnimationTab({ element }),
			buildBlendingTab({ element }),
			buildClipEffectsTab({ element }),
		],
	};
}

function getGraphicConfig({
	element,
}: {
	element: GraphicElement;
}): ElementPropertiesConfig {
	return {
		defaultTab: "graphic",
		tabs: [
			buildGraphicTab({ element }),
			buildTransformTab({ element }),
			buildAnimationTab({ element }),
			buildTrackingTab({ element }),
			buildBlendingTab({ element }),
			buildMasksTab({ element }),
			buildClipEffectsTab({ element }),
		],
	};
}

function getAudioConfig({
	element,
}: {
	element: AudioElement;
}): ElementPropertiesConfig {
	return {
		defaultTab: "audio",
		tabs: [
			{
				id: "audio",
				label: "Basic",
				icon: <HugeiconsIcon icon={MusicNote03Icon} size={16} />,
				content: ({ trackId }) => <AudioBasicTab element={element} trackId={trackId} />,
			},
			{
				id: "voice",
				label: "Voice changer",
				icon: <Mic size={16} />,
				content: ({ trackId }) => (
					<VoiceChangerTab element={element} trackId={trackId} />
				),
			},
			buildSpeedTab({ element }),
		],
	};
}

function getEffectConfig({
	element,
}: {
	element: EffectElement;
}): ElementPropertiesConfig {
	return {
		defaultTab: "effects",
		tabs: [buildStandaloneEffectTab({ element })],
	};
}

export function getPropertiesConfig({
	element,
	mediaAssets,
}: {
	element: TimelineElement;
	mediaAssets: MediaAsset[];
}): ElementPropertiesConfig {
	switch (element.type) {
		case "text":
			return getTextConfig({ element });
		case "video": {
			const mediaAsset = mediaAssets.find((a) => a.id === element.mediaId);
			return getVideoConfig({ element, mediaAsset });
		}
		case "image": {
			const asset = mediaAssets.find((a) => a.id === element.mediaId);
			return getImageConfig({
				element,
				thumbnail: asset?.thumbnailUrl ?? asset?.url ?? null,
			});
		}
		case "sticker":
			return getStickerConfig({ element });
		case "graphic":
			return getGraphicConfig({ element });
		case "audio":
			return getAudioConfig({ element });
		case "effect":
			return getEffectConfig({ element });
	}
}
