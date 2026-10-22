"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { DEFAULT_LOGO_URL } from "@/site/brand";
import { getAccountBridge } from "../use-worksuite-account";

const WELCOME_SEEN_KEY = "wve-welcome-seen";

/** First-run choice: create an account, sign in, or continue without one. */
export function WelcomeDialog() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const bridge = getAccountBridge();
		if (!bridge) return;
		let seen = false;
		try {
			seen = localStorage.getItem(WELCOME_SEEN_KEY) === "1";
		} catch {
			// storage unavailable: show the dialog again next launch
		}
		if (seen) return;
		bridge.getState().then((state) => {
			if (state.status === "signed-out") setOpen(true);
		});
	}, []);

	const close = () => {
		try {
			localStorage.setItem(WELCOME_SEEN_KEY, "1");
		} catch {
			// storage unavailable: show the dialog again next launch
		}
		setOpen(false);
	};

	const choose = (action: "signUp" | "signIn") => {
		close();
		getAccountBridge()?.[action]();
	};

	return (
		<Dialog open={open} onOpenChange={(next) => !next && close()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-3">
						<Image src={DEFAULT_LOGO_URL} alt="" width={28} height={28} />
						Welcome to Worksuite Video Editor
					</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<p className="text-base text-muted-foreground">
						Editing and export work on this computer without an account. Sign in
						with Worksuite Cloud to sync settings and projects across your
						devices.
					</p>
					<div className="flex flex-col gap-2 pt-2">
						<Button onClick={() => choose("signUp")}>
							Create Worksuite account
						</Button>
						<Button variant="outline" onClick={() => choose("signIn")}>
							Sign in
						</Button>
						<Button variant="ghost" onClick={close}>
							Continue without account
						</Button>
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
