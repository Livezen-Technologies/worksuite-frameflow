import { HugeiconsIcon } from "@hugeicons/react";
import { UploadIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

interface MediaDragOverlayProps {
	isVisible: boolean;
	isProcessing?: boolean;
	progress?: number;
	onClick?: () => void;
	/** Files are being dragged over the panel. */
	isDragging?: boolean;
}

export function MediaDragOverlay({
	isVisible,
	isProcessing = false,
	progress = 0,
	onClick,
	isDragging = false,
}: MediaDragOverlayProps) {
	if (!isVisible) return null;

	const handleClick = ({
		event,
	}: {
		event: React.MouseEvent<HTMLButtonElement>;
	}) => {
		if (isProcessing || !onClick) return;
		event.preventDefault();
		event.stopPropagation();
		onClick();
	};

	return (
		<button
			className={cn(
				"group @container flex min-h-56 w-full flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
				isDragging
					? "border-primary bg-primary/10"
					: "border-border hover:border-primary/60 hover:bg-foreground/[0.03]",
				isProcessing && "cursor-progress",
			)}
			type="button"
			disabled={isProcessing || !onClick}
			onClick={(event) => handleClick({ event })}
			data-media-drop
		>
			<div
				className={cn(
					"flex size-12 items-center justify-center rounded-full transition-transform @md:size-14",
					isDragging ? "bg-primary/20 text-primary scale-110" : "bg-foreground/5 text-foreground group-hover:scale-105",
				)}
			>
				<HugeiconsIcon icon={UploadIcon} className="size-6 @md:size-7" />
			</div>

			{isProcessing ? (
				<div className="flex w-full max-w-xs flex-col items-center gap-2">
					<p className="text-sm font-medium">Importing… {progress}%</p>
					<div className="bg-muted/50 h-1.5 w-full overflow-hidden rounded-full">
						<div className="bg-primary h-full rounded-full transition-[width]" style={{ width: `${progress}%` }} />
					</div>
				</div>
			) : (
				<div className="flex flex-col items-center gap-1">
					<p className="text-sm font-medium @md:text-base">
						{isDragging ? "Drop to import" : "Drop files here or click to import"}
					</p>
					<p className="text-muted-foreground max-w-xs text-xs">
						Videos, photos and audio. They stay on this computer.
					</p>
					<p className="text-muted-foreground/70 mt-2 hidden font-mono text-[10px] tracking-wide @xs:block">
						MP4 · MOV · WEBM · MKV · MP3 · WAV · M4A · PNG · JPG · HEIC
					</p>
				</div>
			)}
		</button>
	);
}
