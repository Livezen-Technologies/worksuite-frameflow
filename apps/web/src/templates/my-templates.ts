"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProjectTemplate } from "./project-templates";

/*
 * "My templates" for video templates, kept on this device (like My
 * templates in Text and the project-settings templates). Not synced to
 * Worksuite Cloud: there is no template sync layer yet.
 */

interface MyProjectTemplatesStore {
	templates: ProjectTemplate[];
	add: (template: ProjectTemplate) => void;
	rename: (id: string, name: string) => void;
	remove: (id: string) => void;
}

export const useMyProjectTemplates = create<MyProjectTemplatesStore>()(
	persist(
		(set) => ({
			templates: [],
			add: (template) => set((s) => ({ templates: [...s.templates.filter((t) => t.id !== template.id), { ...template, source: { kind: "user" } }] })),
			rename: (id, name) => set((s) => ({ templates: s.templates.map((t) => (t.id === id && name.trim() ? { ...t, name: name.trim() } : t)) })),
			remove: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
		}),
		{ name: "frameflow-project-templates", version: 1 },
	),
);
