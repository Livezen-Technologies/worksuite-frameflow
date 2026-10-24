"use client";

import { ChevronDown, ChevronRight, Eye, EyeOff, Folder, Lock, LockOpen } from "lucide-react";
import { useState } from "react";
import { groupLayers, groupSelection, newId, ungroup, type Layer, type LayerGroup } from "../model";
import { useStudio } from "../store";
import { cn } from "@/utils/ui";

function Row({ layer, depth }: { layer: Layer; depth: number }) {
	const selected = useStudio((s) => s.selection.includes(layer.id));
	const { select, updateLayer } = useStudio.getState();
	const [renaming, setRenaming] = useState(false);
	return (
		<div
			className={cn("group flex items-center gap-1 px-2 py-1 text-xs", selected ? "bg-primary/20" : "hover:bg-accent")}
			style={{ paddingLeft: 8 + depth * 14 }}
			data-motion-layer-row={layer.id}
		>
			<button
				type="button"
				className="min-w-0 flex-1 truncate text-left"
				onClick={(e) => {
					const ids = useStudio.getState().selection;
					select(e.shiftKey ? (ids.includes(layer.id) ? ids.filter((i) => i !== layer.id) : [...ids, layer.id]) : [layer.id]);
				}}
				onDoubleClick={() => setRenaming(true)}
			>
				<span className="text-muted-foreground mr-1 text-[10px] uppercase">{layer.kind}</span>
				{renaming ? (
					<input
						ref={(el) => el?.focus()}
						defaultValue={layer.name}
						aria-label="Layer name"
						className="bg-muted h-5 w-[calc(100%-2.5rem)] border px-1"
						onClick={(e) => e.stopPropagation()}
						onBlur={(e) => {
							const name = e.target.value.trim();
							if (name && name !== layer.name) updateLayer({ id: layer.id, update: (l) => ({ ...l, name }) });
							setRenaming(false);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") e.currentTarget.blur();
							if (e.key === "Escape") setRenaming(false);
						}}
					/>
				) : (
					layer.name
				)}
			</button>
			<button
				type="button"
				aria-label={layer.visible ? "Hide" : "Show"}
				className="text-muted-foreground hover:text-foreground"
				onClick={() => updateLayer({ id: layer.id, update: (l) => ({ ...l, visible: !l.visible }) })}
			>
				{layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
			</button>
			<button
				type="button"
				aria-label={layer.locked ? "Unlock" : "Lock"}
				className="text-muted-foreground hover:text-foreground"
				onClick={() => updateLayer({ id: layer.id, update: (l) => ({ ...l, locked: !l.locked }) })}
			>
				{layer.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5 opacity-40" />}
			</button>
		</div>
	);
}

/** Layers, top first, with groups (which can nest). */
export function LayersPanel() {
	const project = useStudio((s) => s.project);
	const selection = useStudio((s) => s.selection);
	if (!project) return null;
	const { commit } = useStudio.getState();
	const top = [...project.layers].reverse();
	const groupById = new Map(project.groups.map((g) => [g.id, g]));

	/** The chain of groups from the outermost down to the layer's own group. */
	const chainOf = (layer: Layer): LayerGroup[] => {
		const chain: LayerGroup[] = [];
		let g = layer.groupId ? groupById.get(layer.groupId) : undefined;
		const seen = new Set<string>();
		while (g && !seen.has(g.id)) {
			seen.add(g.id);
			chain.unshift(g);
			g = g.parentId ? groupById.get(g.parentId) : undefined;
		}
		return chain;
	};

	const groupSelected = () => {
		if (selection.length < 1) return;
		commit((p) => groupSelection({ project: p, selection, id: newId("g"), name: `Group ${p.groups.length + 1}` }));
	};
	const move = (dir: 1 | -1) =>
		commit((p) => {
			const layers = [...p.layers];
			const order = dir === 1 ? [...layers.keys()].reverse() : [...layers.keys()];
			for (const i of order) {
				const j = i + dir;
				if (!selection.includes(layers[i].id) || j < 0 || j >= layers.length || selection.includes(layers[j].id)) continue;
				[layers[i], layers[j]] = [layers[j], layers[i]];
			}
			return { ...p, layers };
		});

	const renderGroup = ({ group, depth }: { group: LayerGroup; depth: number }): React.ReactNode => {
		const members = groupLayers({ project, groupId: group.id });
		const allHidden = members.every((m) => !m.visible);
		const allLocked = members.every((m) => m.locked);
		const ids = new Set(members.map((m) => m.id));
		const setAll = (patch: Partial<Pick<Layer, "visible" | "locked">>) => commit((p) => ({ ...p, layers: p.layers.map((l) => (ids.has(l.id) ? { ...l, ...patch } : l)) }));
		const shown = new Set<string>();
		const children: React.ReactNode[] = [];
		if (!group.collapsed)
			for (const layer of top) {
				if (!ids.has(layer.id)) continue;
				const chain = chainOf(layer);
				const at = chain.findIndex((g) => g.id === group.id);
				const child = chain[at + 1];
				if (!child) children.push(<Row key={layer.id} layer={layer} depth={depth + 1} />);
				else if (!shown.has(child.id)) {
					shown.add(child.id);
					children.push(renderGroup({ group: child, depth: depth + 1 }));
				}
			}
		return (
			<div key={group.id} data-motion-group-row={group.id}>
				<div className="hover:bg-accent flex items-center gap-1 py-1 pr-1 text-xs" style={{ paddingLeft: 4 + depth * 14 }}>
					<button
						type="button"
						aria-label={group.collapsed ? "Expand group" : "Collapse group"}
						onClick={() => commit((p) => ({ ...p, groups: p.groups.map((g) => (g.id === group.id ? { ...g, collapsed: !g.collapsed } : g)) }))}
					>
						{group.collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
					</button>
					<Folder className="text-muted-foreground size-3" />
					<button
						type="button"
						className="min-w-0 flex-1 truncate text-left font-medium"
						onClick={() => useStudio.getState().select(members.map((m) => m.id))}
						onDoubleClick={() => commit((p) => ungroup({ project: p, groupId: group.id }))}
						title="Click to select the group; double-click to ungroup"
					>
						{group.name}
					</button>
					<button type="button" aria-label="Show or hide group" className="text-muted-foreground hover:text-foreground" onClick={() => setAll({ visible: allHidden })}>
						{allHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
					</button>
					<button type="button" aria-label="Lock or unlock group" className="text-muted-foreground hover:text-foreground" onClick={() => setAll({ locked: !allLocked })}>
						{allLocked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5 opacity-40" />}
					</button>
				</div>
				{children}
			</div>
		);
	};

	const rendered = new Set<string>();
	const rows: React.ReactNode[] = [];
	for (const layer of top) {
		const root = chainOf(layer)[0];
		if (!root) rows.push(<Row key={layer.id} layer={layer} depth={0} />);
		else if (!rendered.has(root.id)) {
			rendered.add(root.id);
			rows.push(renderGroup({ group: root, depth: 0 }));
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-col" data-motion-layers>
			<div className="flex items-center gap-1 border-b px-2 py-1.5 text-xs">
				<span className="flex-1 font-medium">Layers</span>
				<button type="button" className="text-muted-foreground hover:text-foreground px-1" onClick={() => move(1)} disabled={!selection.length} title="Bring forward">
					↑
				</button>
				<button type="button" className="text-muted-foreground hover:text-foreground px-1" onClick={() => move(-1)} disabled={!selection.length} title="Send backward">
					↓
				</button>
				<button type="button" className="text-muted-foreground hover:text-foreground px-1" onClick={groupSelected} disabled={!selection.length} title="Group selected layers; selecting whole groups nests them" data-motion-group>
					<Folder className="size-3.5" />
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto py-1">
				{rows}
				{!project.layers.length && <p className="text-muted-foreground px-3 py-6 text-center text-xs">Add a shape, text or picture to start.</p>}
			</div>
		</div>
	);
}
