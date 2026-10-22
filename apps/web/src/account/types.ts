export type WorksuiteAccountStatus =
	| "signed-out"
	| "signing-in"
	| "signed-in"
	| "expired";

export interface WorksuiteWorkspace {
	id: string;
	name: string;
	type: "personal" | "team";
	role: string | null;
	plan: string | null;
	storageQuota: number | null;
	storageUsed: number | null;
}

export interface WorksuiteProfile {
	id: string | null;
	name: string;
	email: string | null;
	picture: string | null;
	plan: string | null;
	storageQuota: number | null;
	storageUsed: number | null;
	features: string[];
	/** Personal account plus teams/organisations; empty if the server lists none. */
	workspaces: WorksuiteWorkspace[];
	workspaceId: string | null;
}

export interface WorksuiteSignInProgress {
	/** Authorize URL open in the browser; holds no secret (PKCE). */
	url: string;
	startedAt: number;
	expiresAt: number;
}

export interface WorksuiteAccountState {
	status: WorksuiteAccountStatus;
	profile: WorksuiteProfile | null;
	error: string | null;
	signIn: WorksuiteSignInProgress | null;
}

/** Bridge exposed by the desktop app's preload script (electron/preload.js). */
export interface WorksuiteAccountBridge {
	getState: () => Promise<WorksuiteAccountState>;
	signIn: () => Promise<{ ok: boolean; error?: string }>;
	signUp: () => Promise<{ ok: boolean; error?: string }>;
	cancelSignIn: () => Promise<void>;
	reopenSignIn: () => Promise<void>;
	switchWorkspace: (id: string) => Promise<WorksuiteProfile>;
	signOut: () => Promise<void>;
	manage: () => Promise<void>;
	onChange: (listener: (state: WorksuiteAccountState) => void) => () => void;
}

declare global {
	interface Window {
		worksuite?: {
			app: { getVersion: () => Promise<string> };
			account: WorksuiteAccountBridge;
		};
	}
}
