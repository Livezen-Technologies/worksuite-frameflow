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
