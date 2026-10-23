import type { GuideDefinition } from "@/guides/types";
import { TikTokLayout } from "./tiktok-layout";

/** Lettered badge: no third-party logo fetching (SRS SP-14, SP-17). */
function PlatformLogo({
	domain,
	className = "size-4",
}: {
	domain: string;
	className?: string;
}) {
	return (
		<span
			className={`${className} bg-foreground/15 inline-flex items-center justify-center rounded-[4px] text-[9px] font-semibold uppercase`}
			aria-hidden
		>
			{domain.charAt(0)}
		</span>
	);
}

function PlatformGuidePreview({ domain }: { domain: string }) {
	return <PlatformLogo domain={domain} />;
}

function platformGuide({
	id,
	label,
	domain,
}: {
	id: string;
	label: string;
	domain: string;
}): GuideDefinition {
	return {
		id,
		label,
		renderPreview: () => <PlatformGuidePreview domain={domain} />,
		renderTriggerIcon: () => <PlatformLogo domain={domain} />,
		renderOverlay: () => null,
	};
}

export const tiktokGuide: GuideDefinition = {
	...platformGuide({ id: "tiktok", label: "TikTok", domain: "tiktok.com" }),
	renderOverlay: () => <TikTokLayout />,
};
export const igReelsGuide = platformGuide({
	id: "ig-reels",
	label: "Reels",
	domain: "instagram.com",
});
export const ytShortsGuide = platformGuide({
	id: "yt-shorts",
	label: "Shorts",
	domain: "youtube.com",
});
export const spotlightGuide = platformGuide({
	id: "spotlight",
	label: "Spotlight",
	domain: "snapchat.com",
});
