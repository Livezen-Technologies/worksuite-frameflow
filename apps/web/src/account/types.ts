import type { ProjectWindowsBridge } from "@/windows/bridge";
import type { MasterExportBridge } from "@/export/master";
import type { CursorLog } from "@/screen-zoom/types";
import type { NativeHelperBridge } from "@/proxy/bridge";
import type { AutomationBridge } from "@/automation/bridge";
import type { AiBridge } from "@/ai/bridge";
import type { ProjectFoldersBridge } from "@/project-folder/bridge";
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
			files?: {
				saveExport: (args: {
					suggestedName: string;
					data: ArrayBuffer;
					sideFiles?: { suffix: string; content: string }[];
				}) => Promise<{ saved: boolean; path?: string }>;
				/** Saves into Videos/Worksuite without a dialog (export queue). */
				saveToFolder?: (args: {
					fileName: string;
					data: ArrayBuffer;
				}) => Promise<{ saved: boolean; path?: string }>;
				/** Reveals an exported file; false when it was moved or deleted. */
				show: (filePath: string) => Promise<boolean | void>;
			};
			cloud?: WorksuiteCloudBridge;
			master?: MasterExportBridge;
			updates?: WorksuiteUpdatesBridge;
			assets?: import("@/asset-library/types").WorksuiteAssetsBridge;
			capture?: WorksuiteCaptureBridge;
			network?: WorksuiteNetworkBridge;
			uploads?: WorksuiteUploadsBridge;
			folders?: ProjectFoldersBridge;
			ai?: AiBridge;
			automation?: AutomationBridge;
			helper?: NativeHelperBridge;
			windows?: ProjectWindowsBridge;
			/** Tools › Video converter and Video downloader (desktop). */
			tools?: {
				pathForFile: (file: File) => string;
				convert: (args: {
					jobId: string;
					input: string;
					options: ConvertOptions;
					saveTo?: string;
				}) => Promise<ConvertResult>;
				caps: () => Promise<{ available: boolean; gpus: string[]; cpu: boolean }>;
				probe: (input: string) => Promise<MediaProbe>;
				trim: (args: { jobId: string; input: string; start: number; end: number; saveTo?: string }) => Promise<ConvertResult>;
				merge: (args: { jobId: string; inputs: string[]; saveTo?: string }) => Promise<ConvertResult & { reencoded: boolean }>;
				repair: (args: { jobId: string; input: string; saveTo?: string }) => Promise<ConvertResult & { duration: number }>;
				chooseFolder: () => Promise<string | null>;
				cancelConvert: (jobId: string) => Promise<void>;
				onConvertProgress: (listener: (p: { jobId: string; progress: number }) => void) => () => void;
				inspectLink: (url: string) => Promise<LinkInfo>;
				download: (args: {
					jobId: string;
					url: string;
					kind?: LinkInfo["kind"];
					name?: string;
					title?: string;
					start?: number;
					end?: number;
					audioOnly?: boolean;
					duration?: number;
					speedLimit?: number;
				}) => Promise<{ path: string; name: string; bytes: number }>;
				pauseDownload: (jobId: string) => Promise<boolean>;
				cancelDownload: (jobId: string) => Promise<void>;
				onDownloadProgress: (listener: (p: { jobId: string; received: number; total: number }) => void) => () => void;
				readSaved: (filePath: string) => Promise<ArrayBuffer>;
			};
			/** The standalone recorder window. */
			recorder?: {
				open: () => Promise<void>;
				focusMain: () => Promise<void>;
				minimize: () => Promise<void>;
			};
		};
	}
}

export type CloudUploadProgress = {
	phase: "uploading" | "finishing";
	progress: number;
};

export type CloudShareResult =
	| { ok: true; url: string; expiresAt: string | null; assetId: string }
	| {
			ok: false;
			code:
				| "auth"
				| "quota"
				| "network"
				| "cancelled"
				| "busy"
				| "denied"
				| "http"
				| "error";
			message: string;
	  };

export interface WorksuiteCloudBridge {
	uploadAndShare: (args: {
		filePath: string;
		expiresInDays: number | null;
		allowDownload: boolean;
	}) => Promise<CloudShareResult>;
	cancel: () => Promise<void>;
	sync: <K extends keyof CloudSyncOperations>(
		operation: K,
		args: CloudSyncOperations[K]["args"],
	) => Promise<CloudSyncResult<CloudSyncOperations[K]["value"]>>;
	copy: (text: string) => Promise<void>;
	onProgress: (listener: (progress: CloudUploadProgress) => void) => () => void;
}

export type CloudProjectRole = "owner" | "edit" | "view";

export interface CloudProjectSummary {
	id: string;
	name: string;
	revision: number;
	updatedAt: string | null;
	/** This user's role on the project (CL-07). */
	role: CloudProjectRole;
	ownerName: string | null;
	shared: boolean;
}

export interface CloudMember {
	userId: string;
	name: string;
	email: string | null;
	role: CloudProjectRole | "member";
}

export type CloudSyncResult<T> =
	| { ok: true; value: T }
	| { ok: false; code: string; message: string };

export interface CloudSyncOperations {
	listProjects: { args: Record<string, never>; value: CloudProjectSummary[] };
	createProject: { args: { name: string }; value: CloudProjectSummary };
	getProject: {
		args: { id: string };
		value: CloudProjectSummary & { data: unknown };
	};
	putProject: {
		args: { id: string; revision: number; name: string; data: unknown };
		value: { revision: number };
	};
	uploadMedia: {
		args: {
			name: string;
			contentType: string;
			sha256: string;
			data: ArrayBuffer;
		};
		value: { assetId: string };
	};
	listTeamMembers: {
		args: Record<string, never>;
		value: {
			team: { id: string; name: string } | null;
			members: CloudMember[];
		};
	};
	listProjectMembers: { args: { id: string }; value: CloudMember[] };
	setProjectMember: {
		args: { id: string; userId: string; role: "edit" | "view" };
		value: Record<string, never>;
	};
	removeProjectMember: {
		args: { id: string; userId: string };
		value: Record<string, never>;
	};
	downloadAsset: {
		args: { assetId: string };
		value: Uint8Array<ArrayBuffer>;
	};
	getSettings: {
		args: Record<string, never>;
		value: { revision: number; items: Record<string, SyncedSetting> };
	};
	putSettings: {
		args: { revision: number; items: Record<string, SyncedSetting> };
		value: { revision: number };
	};
	listLibrary: {
		args: { scope: LibraryScope; folderId: string | null };
		value: { folders: LibraryFolder[]; items: LibraryItem[] };
	};
	createLibraryFolder: {
		args: { scope: LibraryScope; name: string; parentId: string | null };
		value: LibraryFolder;
	};
	addLibraryItem: {
		args: {
			scope: LibraryScope;
			folderId: string | null;
			name: string;
			kind: LibraryKind;
			contentType: string;
			sha256: string;
			data: ArrayBuffer;
		};
		value: LibraryItem;
	};
	removeLibraryItem: {
		args: { id: string };
		value: Record<string, never>;
	};
}

/** A synced setting (CL-01): its stored value and when it last changed. */
export interface SyncedSetting {
	value: unknown;
	updatedAt: number;
}

export type LibraryScope = "personal" | "team";
export type LibraryKind =
	| "logo"
	| "intro"
	| "music"
	| "lut"
	| "video"
	| "image"
	| "audio"
	| "other";

export interface LibraryFolder {
	id: string;
	name: string;
}

export interface LibraryItem {
	id: string;
	name: string;
	kind: LibraryKind;
	folderId: string | null;
	assetId: string;
	size: number;
	contentType: string;
	thumbnailUrl: string | null;
	addedBy: string | null;
}

/** Offline mode and upload pacing (CL-08, CL-09). */
export interface NetworkState {
	offline: boolean;
	/** Bytes per second for uploads; 0 = no limit. */
	bandwidthLimit: number;
}

export interface WorksuiteNetworkBridge {
	getState: () => Promise<NetworkState>;
	update: (patch: Partial<NetworkState>) => Promise<NetworkState>;
	onChange: (listener: (state: NetworkState) => void) => () => void;
}

export interface UploadItem {
	id: string;
	name: string;
	size: number;
	sent: number;
	purpose: string;
	state: "uploading" | "paused" | "waiting" | "done" | "error" | "cancelled";
	error: string | null;
	startedAt: number;
}

export interface WorksuiteUploadsBridge {
	list: () => Promise<UploadItem[]>;
	pause: (id: string) => Promise<UploadItem[]>;
	resume: (id: string) => Promise<UploadItem[]>;
	pauseAll: () => Promise<UploadItem[]>;
	resumeAll: () => Promise<UploadItem[]>;
	onChange: (listener: (list: UploadItem[]) => void) => () => void;
}

export interface UpdateState {
	status:
		| "idle"
		| "checking"
		| "available"
		| "downloading"
		| "ready"
		| "up-to-date"
		| "error"
		| "unsupported";
	currentVersion: string;
	version: string | null;
	notes: string | null;
	progress: number;
	error: string | null;
	/** False on ad-hoc-signed macOS and .deb: updates come from the download center. */
	selfInstall: boolean;
	channel: "stable" | "beta";
	auto: boolean;
	downloadPage: string;
	checkedAt: number | null;
}

export interface WorksuiteUpdatesBridge {
	getState: () => Promise<UpdateState>;
	check: () => Promise<UpdateState>;
	download: () => Promise<UpdateState>;
	install: () => Promise<void>;
	configure: (settings: {
		channel?: UpdateState["channel"];
		auto?: boolean;
	}) => Promise<UpdateState>;
	onChange: (listener: (state: UpdateState) => void) => () => void;
}

export interface CaptureSource {
	id: string;
	name: string;
	kind: "screen" | "window";
	thumbnail: string | null;
}

export type MediaAccess =
	| "granted"
	| "denied"
	| "restricted"
	| "not-determined"
	| "unknown";

/** What the downloader learns about a link before downloading (DL-01). */
export interface LinkInfo {
	ok: boolean;
	host: string;
	reason?: string;
	kind?: "file" | "hls" | "dash";
	url?: string;
	name?: string;
	title?: string | null;
	bytes?: number;
	type?: string;
	duration?: number;
	resumable?: boolean;
	audio?: boolean;
	variants?: { url: string; height: number; bandwidth: number; label: string }[];
}

/** What the converter learns about a file before converting it (CV-01). */
export interface MediaProbe {
	ok: boolean;
	problem?: string;
	bytes: number;
	duration?: number;
	hasVideo?: boolean;
	hasAudio?: boolean;
	videoCodec?: string;
	audioCodec?: string;
	width?: number;
	height?: number;
	fps?: number;
	hdr?: "HLG" | "PQ" | null;
	tenBit?: boolean;
	sampleRate?: number;
	channels?: number;
	camera?: string | null;
}

export interface ConvertOptions {
	format: string;
	height?: number;
	fps?: number;
	quality?: number;
	encoder?: "auto" | "sw";
	toneMap?: boolean;
	lut?: string | null;
	burnSubtitles?: boolean;
	loudnorm?: boolean;
	denoise?: boolean;
	removeAudio?: boolean;
	audioKbps?: number;
	targetBytes?: number;
	start?: number;
	end?: number;
	rotate?: 0 | 90 | 180 | 270;
	flip?: "h" | "v" | null;
	crop?: string | null;
	suffix?: string;
}

export interface ConvertResult {
	path: string;
	bytes: number;
	sourceBytes?: number;
}

export interface WorksuiteCaptureBridge {
	sources: () => Promise<CaptureSource[]>;
	/** The screen or window the next getDisplayMedia call records. */
	choose: (id: string | null) => Promise<void>;
	permissions: () => Promise<{
		microphone: MediaAccess;
		camera: MediaAccess;
		screen: MediaAccess;
	}>;
	/** Cursor and click log while screen recording (SC-06). */
	cursorStart?: (args: {
		sourceId: string | null;
	}) => Promise<{ cursor: boolean; clicks: boolean; keys: boolean }>;
	cursorPause?: () => Promise<void>;
	cursorResume?: () => Promise<void>;
	cursorStop?: () => Promise<CursorLog | null>;
	/** Floating control bar (SC-04). */
	showBar?: () => Promise<void>;
	barState?: (state: {
		elapsed?: number;
		paused?: boolean;
		micMuted?: boolean;
		/** null when the take has no camera. */
		cameraOff?: boolean | null;
		countdown?: number;
	}) => Promise<void>;
	hideBar?: () => Promise<void>;
	/** Open window titles, for pausing when a protected app shows (SC-08). */
	windowNames?: () => Promise<string[]>;
	/** Hold notifications back during a take (SC-08). */
	doNotDisturb?: (on: boolean) => Promise<{ ok: boolean; reason?: string }>;
	/** Global shortcuts (SC-05); returns accelerators another app holds. */
	setShortcuts?: (
		next: Record<string, string>,
	) => Promise<{ shortcuts: Record<string, string>; failed: string[] }>;
	onCommand?: (listener: (command: CaptureCommand) => void) => () => void;
}

export type CaptureCommand =
	| "toggle"
	| "toggle-pause"
	| "marker"
	| "stop"
	| "discard"
	| "toggle-mic"
	| "toggle-camera";
