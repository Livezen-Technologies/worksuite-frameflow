/** Desktop app side of the local automation API (electron/automation.js). */
export interface AutomationState {
	enabled: boolean;
	running: boolean;
	socket: string | null;
	discovery: string;
}

export interface AutomationBridge {
	getState: () => Promise<AutomationState>;
	setEnabled: (enabled: boolean) => Promise<AutomationState>;
	onCall: (
		handler: (method: string, params: unknown) => Promise<unknown>,
	) => () => void;
	/** Sends an event to subscribed automation clients (AU-03). */
	emit?: (topic: string, data: unknown) => void;
}

export function automationBridge(): AutomationBridge | null {
	if (typeof window === "undefined") return null;
	return window.worksuite?.automation ?? null;
}
