"use client";

import { useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { CloudMember } from "@/account/types";
import { cn } from "@/utils/ui";
import { cloudCall } from "../sync";

type Access = "none" | "view" | "edit";

const ACCESS: { value: Access; label: string }[] = [
	{ value: "none", label: "No access" },
	{ value: "view", label: "Can view" },
	{ value: "edit", label: "Can edit" },
];

function initials(name: string) {
	return name
		.split(/\s+/)
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

/** Share a synced project with people in the team workspace (SRS CL-07). */
export function ShareProjectDialog({
	cloudId,
	projectName,
	open,
	onOpenChange,
}: {
	cloudId: string;
	projectName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [team, setTeam] = useState<{ id: string; name: string } | null>(null);
	const [people, setPeople] = useState<CloudMember[] | null>(null);
	const [access, setAccess] = useState<Record<string, Access>>({});
	const [owners, setOwners] = useState<Set<string>>(new Set());
	const [saving, setSaving] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		let live = true;
		Promise.all([
			cloudCall({ operation: "listTeamMembers", args: {} }),
			cloudCall({ operation: "listProjectMembers", args: { id: cloudId } }),
		])
			.then(([teamResult, members]) => {
				if (!live) return;
				const next: Record<string, Access> = {};
				const ownerIds = new Set<string>();
				for (const member of members) {
					if (member.role === "owner") ownerIds.add(member.userId);
					else if (member.role === "edit" || member.role === "view") {
						next[member.userId] = member.role;
					}
				}
				const byId = new Map<string, CloudMember>();
				for (const m of [...teamResult.members, ...members])
					byId.set(m.userId, m);
				setTeam(teamResult.team);
				setPeople([...byId.values()]);
				setAccess(next);
				setOwners(ownerIds);
				setError(null);
			})
			.catch(
				(e: unknown) =>
					live &&
					setError(e instanceof Error ? e.message : "Couldn't load members"),
			);
		return () => {
			live = false;
		};
	}, [open, cloudId]);

	const change = async ({
		member,
		value,
	}: {
		member: CloudMember;
		value: Access;
	}) => {
		const previous = access[member.userId] ?? "none";
		if (previous === value) return;
		setSaving(member.userId);
		setAccess((a) => ({ ...a, [member.userId]: value }));
		try {
			if (value === "none") {
				await cloudCall({
					operation: "removeProjectMember",
					args: { id: cloudId, userId: member.userId },
				});
			} else {
				await cloudCall({
					operation: "setProjectMember",
					args: { id: cloudId, userId: member.userId, role: value },
				});
			}
			toast.success(
				value === "none"
					? `${member.name} no longer has access`
					: `${member.name} ${value === "edit" ? "can edit" : "can view"} “${projectName}”`,
			);
		} catch (e) {
			setAccess((a) => ({ ...a, [member.userId]: previous }));
			toast.error(e instanceof Error ? e.message : "Couldn't change access");
		} finally {
			setSaving(null);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md" aria-describedby={undefined}>
				<DialogHeader className="py-4">
					<DialogTitle className="flex items-center gap-2">
						<Users className="size-4" /> Share “{projectName}”
					</DialogTitle>
				</DialogHeader>
				<DialogBody className="gap-3 py-4" data-share-project>
					{error ? (
						<p className="text-destructive text-sm">{error}</p>
					) : people === null ? (
						<div className="text-muted-foreground flex items-center gap-2 text-sm">
							<Loader2 className="size-4 animate-spin" /> Loading your team…
						</div>
					) : !team ? (
						<p className="text-muted-foreground text-sm">
							Sharing works in a team workspace. Switch to your team from the
							account menu, then share again.
						</p>
					) : (
						<>
							<p className="text-muted-foreground text-xs">
								People in {team.name}. “Can view” gets updates but can&rsquo;t
								change the cloud copy; “Can edit” syncs like you do.
							</p>
							<ul className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-md border">
								{people.map((member) => {
									const isOwner = owners.has(member.userId);
									const current = access[member.userId] ?? "none";
									return (
										<li
											key={member.userId}
											className="flex items-center gap-3 px-3 py-2"
											data-member={member.email ?? member.name}
										>
											<span className="bg-accent flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
												{initials(member.name)}
											</span>
											<div className="flex min-w-0 flex-1 flex-col">
												<span className="truncate text-sm">{member.name}</span>
												{member.email && (
													<span className="text-muted-foreground truncate text-xs">
														{member.email}
													</span>
												)}
											</div>
											{isOwner ? (
												<span className="text-muted-foreground text-xs">
													Owner
												</span>
											) : (
												<div className="flex items-center gap-0.5 rounded-md border p-0.5">
													{ACCESS.map((option) => (
														<button
															key={option.value}
															type="button"
															disabled={saving === member.userId}
															onClick={() =>
																void change({ member, value: option.value })
															}
															className={cn(
																"rounded px-2 py-0.5 text-[11px]",
																current === option.value
																	? "bg-primary text-primary-foreground"
																	: "text-muted-foreground hover:bg-accent",
															)}
														>
															{option.label}
														</button>
													))}
												</div>
											)}
										</li>
									);
								})}
							</ul>
						</>
					)}
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
