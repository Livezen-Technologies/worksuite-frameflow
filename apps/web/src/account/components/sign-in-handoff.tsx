"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWorksuiteAccount } from "../use-worksuite-account";

function formatRemaining(ms: number) {
	const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = String(totalSeconds % 60).padStart(2, "0");
	return `${minutes}:${seconds}`;
}

/** Full-screen "Finish in your browser" while a sign-in is in progress. */
export function SignInHandoff() {
	const { bridge, state } = useWorksuiteAccount();
	const [now, setNow] = useState(() => Date.now());
	const signingIn = state?.status === "signing-in";

	useEffect(() => {
		if (!signingIn) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [signingIn]);

	if (!bridge || !signingIn) return null;
	const progress = state.signIn;

	const copyLink = async () => {
		if (!progress) return;
		try {
			await navigator.clipboard.writeText(progress.url);
			toast.success("Sign-in link copied");
		} catch {
			toast.error("Couldn't copy the link");
		}
	};

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="handoff-title"
			className="bg-background text-foreground fixed inset-0 z-50 flex items-center justify-center overflow-auto p-6"
		>
			<div className="flex w-full max-w-[480px] flex-col gap-[18px]">
				<div className="bg-secondary flex size-14 items-center justify-center rounded-[14px]">
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="text-secondary-foreground"
						aria-hidden="true"
					>
						<rect x="3" y="4" width="18" height="16" rx="2" />
						<path d="M3 9h18" />
						<path d="M14 14h3" />
						<path d="M15.5 12.5 17 14l-1.5 1.5" />
					</svg>
				</div>
				<h1
					id="handoff-title"
					className="m-0 text-[34px] font-bold tracking-tight"
				>
					Finish in your browser
				</h1>
				<p className="text-muted-foreground m-0 text-base leading-relaxed">
					We opened worksuitecloud.com in your browser. Create your account or
					sign in there, and this window will continue automatically.
				</p>
				<div className="flex items-center gap-2.5 text-sm" role="status">
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.2"
						strokeLinecap="round"
						className="text-caution animate-spin"
						aria-hidden="true"
					>
						<path d="M12 3a9 9 0 1 0 9 9" />
					</svg>
					Waiting for Worksuite Cloud…
					{progress &&
						` link expires in ${formatRemaining(progress.expiresAt - now)}`}
				</div>
				<div className="flex flex-wrap gap-3">
					<Button
						variant="outline"
						className="bg-accent h-11 rounded-[10px] px-[18px] font-semibold"
						onClick={copyLink}
						disabled={!progress}
					>
						Copy sign-in link
					</Button>
					<Button
						variant="outline"
						className="bg-accent h-11 rounded-[10px] px-[18px] font-semibold"
						onClick={() => bridge.reopenSignIn()}
					>
						Open browser again
					</Button>
					<Button
						variant="ghost"
						className="text-muted-foreground h-11"
						onClick={() => bridge.cancelSignIn()}
					>
						Cancel
					</Button>
				</div>
				<p className="text-muted-foreground m-0 text-[13px]">
					Your password is never typed into this app.
				</p>
			</div>
		</div>
	);
}
