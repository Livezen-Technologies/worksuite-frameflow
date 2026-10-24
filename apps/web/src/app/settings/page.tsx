"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SOCIAL_LINKS } from "@/site/social";
import { cn } from "@/utils/ui";
import { useWorksuiteAccount } from "@/account/use-worksuite-account";
import { formatBytes } from "@/account/components/account-menu";
import { SignInHandoff } from "@/account/components/sign-in-handoff";
import { BrandMark } from "@/account/components/brand-mark";
import { WorkspaceList } from "@/account/components/workspace-switcher";
import {
	NetworkSettings,
	SettingsSyncSection,
} from "@/cloud/components/network-section";
import { UpdatesSection } from "@/updates/components/updates-section";
import { UserFontsSection } from "@/fonts/components/user-fonts-section";
import { LocalModelsSection } from "@/ai-export/components/local-models";

const SECTIONS = [
	{ id: "account", label: "Account & cloud" },
	{ id: "network", label: "Network & sync" },
	{ id: "fonts", label: "Fonts" },
	{ id: "updates", label: "Updates" },
	{ id: "models", label: "Local models" },
	{ id: "about", label: "About" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function initials(name: string) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");
}

export default function SettingsPage() {
	const [section, setSection] = useState<SectionId>("account");

	return (
		<div className="bg-background text-foreground flex min-h-screen flex-wrap">
			<SignInHandoff />
			<nav
				aria-label="Settings"
				className="bg-sidebar flex flex-[0_1_240px] flex-col gap-1 border-r px-3 py-5 text-sm"
			>
				<Link
					href="/projects"
					className="text-muted-foreground hover:text-foreground mb-3 rounded-lg px-3 py-2.5"
				>
					← Back
				</Link>
				<div className="text-muted-foreground px-3 pb-2 text-xs font-semibold tracking-wide uppercase">
					Settings
				</div>
				{SECTIONS.map(({ id, label }) => (
					<button
						key={id}
						type="button"
						onClick={() => setSection(id)}
						aria-current={section === id ? "page" : undefined}
						className={cn(
							"rounded-lg px-3 py-2.5 text-left",
							section === id
								? "bg-secondary text-foreground"
								: "text-muted-foreground hover:bg-accent",
						)}
					>
						{label}
					</button>
				))}
			</nav>
			<main className="flex min-w-0 flex-[999_1_560px] flex-col gap-6 p-8 md:px-12">
				{section === "account" ? (
					<AccountSection />
				) : section === "network" ? (
					<>
						<Section title="Network">
							<NetworkSettings />
						</Section>
						<Section title="Settings sync">
							<SettingsSyncSection />
							<p className="text-muted-foreground m-0 text-xs">
								Sign in to keep your shortcuts, presets, templates and
								workspaces the same on every computer.
							</p>
						</Section>
					</>
				) : section === "models" ? (
					<Section title="Local models">
						<LocalModelsSection />
					</Section>
				) : section === "fonts" ? (
					<Section title="Fonts">
						<UserFontsSection />
					</Section>
				) : section === "updates" ? (
					<Section title="Updates">
						<UpdatesSection />
					</Section>
				) : (
					<AboutSection />
				)}
			</main>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="bg-card flex max-w-[860px] flex-col gap-4 rounded-xl border p-5">
			{title && <h2 className="m-0 text-base font-semibold">{title}</h2>}
			{children}
		</section>
	);
}

function AccountSection() {
	const { bridge, state } = useWorksuiteAccount();

	if (!bridge || !state) {
		return (
			<>
				<h1 className="m-0 text-2xl font-bold">Account &amp; cloud</h1>
				<Section>
					<p className="text-muted-foreground m-0">
						Worksuite Cloud sign-in is available in the desktop app.
					</p>
				</Section>
			</>
		);
	}

	const profile = state.status === "signed-in" ? state.profile : null;

	return (
		<>
			<h1 className="m-0 text-2xl font-bold">Account &amp; cloud</h1>
			{profile ? (
				<>
					<Section>
						<div className="flex flex-wrap items-center gap-4">
							<Avatar className="size-14">
								{profile.picture && (
									<AvatarImage src={profile.picture} alt="" />
								)}
								<AvatarFallback className="bg-secondary text-lg font-semibold">
									{initials(profile.name)}
								</AvatarFallback>
							</Avatar>
							<div className="min-w-0 flex-1">
								<div className="truncate text-lg font-semibold">
									{profile.name}
								</div>
								<div className="text-muted-foreground truncate text-sm">
									{profile.email ? `${profile.email} · ` : ""}Worksuite ID
								</div>
							</div>
							{profile.plan && (
								<span className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-xs font-semibold">
									{profile.plan} plan
								</span>
							)}
							<Button variant="link" onClick={() => bridge.manage()}>
								Manage on worksuitecloud.com
							</Button>
							<Button
								variant="outline"
								className="bg-accent"
								onClick={() => bridge.signOut()}
							>
								Sign out
							</Button>
						</div>
					</Section>
					{profile.workspaces.length > 0 && (
						<Section title="Teams">
							<p className="text-muted-foreground m-0 text-sm">
								Plan and cloud storage follow the team you choose. Projects on
								this device stay where they are.
							</p>
							<WorkspaceList />
						</Section>
					)}
					{profile.storageQuota != null && profile.storageUsed != null && (
						<Section title="Cloud storage">
							<div className="text-2xl font-bold">
								{formatBytes(profile.storageUsed)}{" "}
								<span className="text-muted-foreground text-sm font-normal">
									of {formatBytes(profile.storageQuota)}
								</span>
							</div>
							<div className="bg-border h-1.5 rounded-full">
								<div
									className="bg-primary h-1.5 rounded-full"
									style={{
										width: `${Math.min(100, (profile.storageUsed / Math.max(profile.storageQuota, 1)) * 100)}%`,
									}}
								/>
							</div>
						</Section>
					)}
				</>
			) : (
				<Section>
					<p className="text-muted-foreground m-0 leading-relaxed">
						{state.status === "expired"
							? "Your session expired. Sign in again to use Worksuite Cloud. Your local projects are unaffected."
							: "You're using Worksuite FrameFlow without an account. Editing and export work on this computer; sign in to use Worksuite Cloud."}
					</p>
					<div className="flex flex-wrap gap-3">
						<Button onClick={() => bridge.signIn()}>Sign in</Button>
						<Button
							variant="outline"
							className="bg-accent"
							onClick={() => bridge.signUp()}
						>
							Create Worksuite account
						</Button>
					</div>
				</Section>
			)}
		</>
	);
}

function AboutSection() {
	const [version, setVersion] = useState<string | null>(null);

	useEffect(() => {
		window.worksuite?.app.getVersion().then(setVersion);
	}, []);

	return (
		<>
			<h1 className="m-0 text-2xl font-bold">About</h1>
			<Section>
				<div className="flex items-center gap-3">
					<BrandMark className="size-10 rounded-[10px]" />
					<div>
						<div className="font-semibold">Worksuite FrameFlow</div>
						<div className="text-muted-foreground text-sm">
							{version ? `Version ${version} · ` : ""}Livezen Technologies
						</div>
					</div>
				</div>
				<p className="text-muted-foreground m-0 text-sm leading-relaxed">
					Based on OpenCut, released under the MIT licence. The original
					copyright notice is kept in the source.
				</p>
				<div className="flex flex-wrap gap-4 text-sm">
					<a
						href={SOCIAL_LINKS.github}
						target="_blank"
						rel="noreferrer"
						className="text-primary hover:underline"
					>
						Source code
					</a>
					<a
						href="https://github.com/opencut-app/opencut-classic"
						target="_blank"
						rel="noreferrer"
						className="text-primary hover:underline"
					>
						OpenCut
					</a>
				</div>
			</Section>
		</>
	);
}
