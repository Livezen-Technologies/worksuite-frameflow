"use client";

import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";
import type { MotionProject } from "./model";

let adapter: IndexedDBAdapter<MotionProject> | null = null;
const store = () =>
	(adapter ??= new IndexedDBAdapter<MotionProject>({ dbName: "frameflow-motion", storeName: "projects", version: 1 }));

export function saveMotionProject(project: MotionProject): Promise<void> {
	return store().set({ key: project.id, value: project });
}

export function loadMotionProject(id: string): Promise<MotionProject | null> {
	return store().get(id);
}

/** Newest first. */
export async function listMotionProjects(): Promise<MotionProject[]> {
	return (await store().getAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteMotionProject(id: string): Promise<void> {
	return store().remove(id);
}

let templateAdapter: IndexedDBAdapter<{ id: string; name: string; savedAt: number; project: MotionProject }> | null = null;
const templateStore = () =>
	(templateAdapter ??= new IndexedDBAdapter({ dbName: "frameflow-motion-templates", storeName: "templates", version: 1 }));

export interface SavedTemplate {
	id: string;
	name: string;
	savedAt: number;
	project: MotionProject;
}

export function saveMotionTemplate(template: SavedTemplate): Promise<void> {
	return templateStore().set({ key: template.id, value: template });
}

export async function listMotionTemplates(): Promise<SavedTemplate[]> {
	return (await templateStore().getAll()).sort((a, b) => b.savedAt - a.savedAt);
}

export function deleteMotionTemplate(id: string): Promise<void> {
	return templateStore().remove(id);
}
