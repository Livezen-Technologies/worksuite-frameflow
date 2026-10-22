"use client";

import { useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorksuiteAccount } from "../use-worksuite-account";
import type { WorksuiteProfile } from "../types";
import { WorkspaceRadioItems } from "./workspace-switcher";

function initials(name: string) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");
}

export function formatBytes(bytes: number) {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

function storageLabel(profile: WorksuiteProfile) {
	if (profile.storageUsed == null || profile.storageQuota == null) return null;
	return `${formatBytes(profile.storageUsed)} of ${formatBytes(profile.storageQuota)} used`;
}

/** Worksuite Cloud account control; renders nothing outside the desktop app. */
export function AccountMenu() {
	const { bridge, state } = useWorksuiteAccount();

	useEffect(() => {
		if (state?.error) toast.error(state.error);
	}, [state?.error]);

	if (!bridge || !state) return null;

	if (state.status !== "signed-in" || !state.profile) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline">
						{state.status === "expired"
							? "Session expired — Sign in"
							: "Sign in"}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-60">
					<DropdownMenuLabel className="font-normal text-muted-foreground">
						Sync settings and projects with Worksuite Cloud
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => bridge.signIn()}>
						Sign in
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => bridge.signUp()}>
						Create Worksuite account
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	const { profile } = state;
	const storage = storageLabel(profile);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="rounded-full focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
					aria-label={`Account: ${profile.name}`}
				>
					<Avatar className="size-9">
						{profile.picture && <AvatarImage src={profile.picture} alt="" />}
						<AvatarFallback className="text-sm font-medium">
							{initials(profile.name)}
						</AvatarFallback>
					</Avatar>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuLabel className="flex flex-col gap-0.5">
					<span className="truncate">{profile.name}</span>
					{profile.email && (
						<span className="truncate text-xs font-normal text-muted-foreground">
							{profile.email}
						</span>
					)}
				</DropdownMenuLabel>
				{(profile.plan || storage) && (
					<DropdownMenuLabel className="flex flex-col gap-0.5 text-xs font-normal text-muted-foreground">
						{profile.plan && <span>Plan: {profile.plan}</span>}
						{storage && <span>{storage}</span>}
					</DropdownMenuLabel>
				)}
				<WorkspaceRadioItems withSeparator />
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link href="/settings">Account settings</Link>
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => bridge.manage()}>
					Manage account
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => bridge.signOut()}>
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
