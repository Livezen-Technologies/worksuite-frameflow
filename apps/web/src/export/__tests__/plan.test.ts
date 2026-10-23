import { describe, expect, test } from "bun:test";
import type { WorksuiteProfile } from "@/account/types";
import { featureAccess } from "../plan";

const profile = ({
	features,
	plan = "Pro",
}: {
	features: string[];
	plan?: string | null;
}): WorksuiteProfile => ({
	id: "u",
	name: "U",
	email: null,
	picture: null,
	plan,
	storageQuota: null,
	storageUsed: null,
	features,
	workspaces: [],
	workspaceId: null,
});

describe("export plan labels", () => {
	test("nothing is gated unless the server says so", () => {
		expect(featureAccess({ profile: null, feature: "ai-ultra-hd" })).toEqual({
			allowed: true,
			label: null,
		});
	});

	test("gated features show the plan or an upgrade badge", () => {
		expect(
			featureAccess({ profile: profile({ features: ["gate:ai-ultra-hd", "ai-ultra-hd"] }), feature: "ai-ultra-hd" }),
		).toEqual({ allowed: true, label: "Pro" });
		expect(
			featureAccess({ profile: profile({ features: ["gate:optical-flow"], plan: null }), feature: "optical-flow" }),
		).toEqual({ allowed: false, label: "Plan feature" });
	});
});
