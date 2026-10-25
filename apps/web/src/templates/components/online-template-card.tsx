"use client";

import { Check, CloudDownload, Film } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cachedImage, formatBytes, packTemplateFacts, resolveCatalogUrl, templateCardVisual } from "@/asset-library/catalog";
import type { CatalogPack, PackDownload } from "@/asset-library/types";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { PreviewCanvas } from "@/text-library/components/text-preview-canvas";
import { drawTemplatePreview, loadOnlineTemplate } from "../online-preview";
import type { ProjectTemplate } from "../project-templates";

const TILE_W = 220;
const TILE_H = 144;

function usePrefersReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReduced(query.matches);
		const on = () => setReduced(query.matches);
		query.addEventListener?.("change", on);
		return () => query.removeEventListener?.("change", on);
	}, []);
	return reduced;
}

/** True once the element has scrolled near the viewport (stays true). */
function useSeen<T extends Element>(): [React.RefObject<T | null>, boolean] {
	const ref = useRef<T>(null);
	const [seen, setSeen] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el || seen) return;
		if (typeof IntersectionObserver === "undefined") {
			setSeen(true);
			return;
		}
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				setSeen(true);
				observer.disconnect();
			}
		}, { rootMargin: "200px" });
		observer.observe(el);
		return () => observer.disconnect();
	}, [seen]);
	return [ref, seen];
}

/** A template drawn live: still mid-frame at rest, playing from 0 in a loop while `playing`. */
export function TemplateLiveCanvas({ template, playing, width = TILE_W, height = TILE_H }: { template: ProjectTemplate; playing: boolean; width?: number; height?: number }) {
	const duration = template.preview?.duration ?? 4;
	return (
		<PreviewCanvas
			draw={(ctx, time) => drawTemplatePreview({ ctx, template, width, height, time })}
			drawKey={template.id}
			duration={duration}
			width={width}
			height={height}
			playing={playing}
			stillAt={duration / 2}
			className="size-full"
		/>
	);
}

/**
 * A template pack from the online library: its catalog picture (resolved
 * against the feed), a live drawing of the template when there's no picture
 * (and on hover), or a styled placeholder with aspect, length and title.
 */
export function OnlineTemplateCard({ pack, base, download, onInstall }: { pack: CatalogPack; base: string | null; download?: PackDownload; onInstall: () => void }) {
	const t = useT();
	const [ref, seen] = useSeen<HTMLDivElement>();
	const [hover, setHover] = useState(false);
	const [imageFailed, setImageFailed] = useState(false);
	const [template, setTemplate] = useState<ProjectTemplate | null>(null);
	const [tried, setTried] = useState(false);
	const reduced = usePrefersReducedMotion();
	const thumb = resolveCatalogUrl(pack.thumbnailUrl, base);
	const needLive = seen && (!thumb || imageFailed || hover);

	useEffect(() => {
		if (!needLive || tried) return;
		setTried(true);
		let live = true;
		void loadOnlineTemplate({ pack, base }).then((tpl) => live && setTemplate(tpl));
		return () => {
			live = false;
		};
	}, [needLive, tried, pack, base]);

	const visual = templateCardVisual({ thumb, imageFailed, canDraw: !!template?.preview });
	const facts = packTemplateFacts(pack);
	const aspect = template?.aspect.label ?? facts.aspect;
	const seconds = template?.preview?.duration ?? facts.seconds;
	const scenes = template ? template.layers.filter((l) => l.kind === "text" || l.kind === "media").length : null;
	const pct = download?.total ? Math.round((download.received / download.total) * 100) : 0;
	const showLive = !!template?.preview && (visual === "live" || (hover && !reduced));

	return (
		<div ref={ref} className="flex flex-col gap-1.5" data-template-pack={pack.id} data-visual={showLive ? "live" : visual}>
			<div
				className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(circle_at_30%_20%,#2b3046,#0f1118)] ring-1 ring-white/5 hover:ring-white/20"
				title={pack.title}
				onPointerEnter={() => setHover(true)}
				onPointerLeave={() => setHover(false)}
			>
				{visual === "image" && thumb && !showLive && (
					// eslint-disable-next-line @next/next/no-img-element -- catalog thumbnail
					<img src={cachedImage(thumb)} alt="" className="size-full object-cover" loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
				)}
				{showLive && template && <TemplateLiveCanvas template={template} playing={hover && !reduced} />}
				{!showLive && visual !== "image" && (
					<div className="flex size-full flex-col items-center justify-center gap-1 px-3 text-center" data-template-placeholder>
						<Film className="text-muted-foreground size-6" />
						<span className="line-clamp-2 text-xs font-medium text-white/80">{pack.title}</span>
					</div>
				)}
				{aspect && <span className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{aspect}</span>}
				{(seconds !== null || (scenes ?? 0) > 1) && (
					<span className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white tabular-nums">
						{seconds !== null ? `${Math.round(seconds)}s` : ""}
						{scenes && scenes > 1 ? ` · ${t("{count} layers", { count: scenes })}` : ""}
					</span>
				)}
				{download && (download.status === "downloading" || download.status === "installing") && (
					<div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
						<div className="bg-primary h-full" style={{ width: `${pct}%` }} />
					</div>
				)}
			</div>
			<div className="flex items-center gap-2">
				<span className="min-w-0 flex-1 truncate text-xs" title={pack.title}>
					{pack.title}
				</span>
				<Button size="sm" variant="secondary" className="h-7 px-2 text-xs" disabled={!!download && download.status !== "error"} onClick={onInstall}>
					{download?.status === "installing" ? <Check className="size-3.5" /> : <CloudDownload className="size-3.5" />}
					{download && download.status !== "error" ? `${pct}%` : formatBytes(pack.sizeBytes)}
				</Button>
			</div>
		</div>
	);
}
