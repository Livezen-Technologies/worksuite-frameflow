import { cn } from "@/utils/ui";

/** Worksuite Video play mark: a dark play triangle on an accent tile. */
export function BrandMark({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"bg-primary inline-flex size-7 shrink-0 items-center justify-center rounded-[7px]",
				className,
			)}
			aria-hidden="true"
		>
			<svg viewBox="0 0 24 24" className="size-1/2" fill="currentColor">
				<polygon
					points="7 4 19 12 7 20 7 4"
					className="text-primary-foreground"
				/>
			</svg>
		</span>
	);
}
