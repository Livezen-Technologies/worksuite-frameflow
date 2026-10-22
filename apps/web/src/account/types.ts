export type WorksuiteAccountStatus =
	| "signed-out"
	| "signing-in"
	| "signed-in"
	| "expired";

export interface WorksuiteProfile {
	id: string | null;
	name: string;
	email: string | null;
	picture: string | null;
	plan: string | null;
	storageQuota: number | null;
	storageUsed: number | null;
	features: string[];
}

export interface WorksuiteAccountState {
	status: WorksuiteAccountStatus;
	profile: WorksuiteProfile | null;
	error: string | null;
}

/** Bridge exposed by the desktop app's preload script (electron/preload.js). */
export interface WorksuiteAccountBridge {
	getState: () => Promise<WorksuiteAccountState>;
	signIn: () => Promise<{ ok: boolean; error?: string }>;
	signUp: () => Promise<{ ok: boolean; error?: string }>;
	cancelSignIn: () => Promise<void>;
	signOut: () => Promise<void>;
	manage: () => Promise<void>;
	onChange: (listener: (state: WorksuiteAccountState) => void) => () => void;
}

declare global {
	interface Window {
		worksuite?: { account: WorksuiteAccountBridge };
	}
}
