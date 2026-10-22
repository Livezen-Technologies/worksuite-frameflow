"use client";

import { useEffect, useState } from "react";
import { SOCIAL_LINKS } from "@/site/social";
import { Button } from "@/components/ui/button";
import { getAccountBridge } from "../use-worksuite-account";
import { BrandMark } from "./brand-mark";

const WELCOME_SEEN_KEY = "frameflow-welcome-seen";

const FEATURES = [
	"Timeline editing",
	"Text & stickers",
	"4K export",
	"Cloud sign-in",
];

/** First-run screen: create an account, sign in, or continue without one. */
export function WelcomeScreen() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const bridge = getAccountBridge();
		if (!bridge) return;
		let seen = false;
		try {
			seen = localStorage.getItem(WELCOME_SEEN_KEY) === "1";
		} catch {
			// storage unavailable: show the welcome screen again next launch
		}
		if (seen) return;
		bridge.getState().then((state) => {
			if (state.status === "signed-out") setOpen(true);
		});
	}, []);

	if (!open) return null;

	const close = () => {
		try {
			localStorage.setItem(WELCOME_SEEN_KEY, "1");
		} catch {
			// storage unavailable: show the welcome screen again next launch
		}
		setOpen(false);
	};

	const choose = (action: "signUp" | "signIn") => {
		close();
		getAccountBridge()?.[action]();
	};

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="welcome-title"
			className="bg-background text-foreground fixed inset-0 z-50 flex flex-wrap overflow-auto"
		>
			<div className="bg-sidebar flex min-w-0 flex-[1_1_560px] flex-col justify-between gap-10 border-r p-10 md:p-16">
				<div className="flex items-center gap-3">
					<BrandMark className="size-10 rounded-[10px]" />
					<div className="text-lg font-bold">
						Worksuite{" "}
						<span className="text-muted-foreground font-medium">
							FrameFlow
						</span>
					</div>
				</div>
				<div className="flex max-w-[520px] flex-col gap-5">
					<h1
						id="welcome-title"
						className="m-0 text-4xl leading-[1.1] font-bold tracking-tight md:text-5xl"
					>
						Cut, caption and ship video. On your machine.
					</h1>
					<p className="text-muted-foreground m-0 text-lg leading-relaxed">
						Edit and export on this computer with no watermark. Sign in with
						Worksuite Cloud to use one account across Worksuite apps.
					</p>
					<ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
						{FEATURES.map((feature) => (
							<li
								key={feature}
								className="bg-accent rounded-full border px-3 py-1.5 text-[13px]"
							>
								{feature}
							</li>
						))}
					</ul>
				</div>
				<div className="text-muted-foreground text-[13px]">
					Based on OpenCut · MIT ·{" "}
					<a
						href={SOCIAL_LINKS.github}
						target="_blank"
						rel="noreferrer"
						className="text-primary hover:underline"
					>
						Source code
					</a>
				</div>
			</div>
			<div className="flex min-w-0 flex-[1_1_480px] items-center justify-center p-10 md:p-16">
				<div className="flex w-full max-w-[400px] flex-col gap-3.5">
					<h2 className="m-0 mb-1.5 text-[26px] font-bold">Get started</h2>
					<p className="text-muted-foreground m-0 mb-3.5 text-[15px] leading-normal">
						One Worksuite account works across Worksuite OS, Cloud, Desktop and
						CMS. Editing works without one.
					</p>
					<Button
						className="h-12 rounded-[10px] text-[15px] font-semibold"
						onClick={() => choose("signUp")}
					>
						Create Worksuite account
					</Button>
					<Button
						variant="outline"
						className="bg-accent h-12 rounded-[10px] text-[15px] font-semibold"
						onClick={() => choose("signIn")}
					>
						Sign in
					</Button>
					<Button
						variant="ghost"
						className="text-muted-foreground h-12 rounded-[10px] text-[15px]"
						onClick={close}
					>
						Continue without account
					</Button>
				</div>
			</div>
		</div>
	);
}
