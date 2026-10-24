"use client";

import { ChevronDown, ChevronRight, Eye, EyeOff, Folder, Lock, LockOpen } from "lucide-react";
import { newId, type Layer } from "../model";
import { useStudio } from "../store";
import { cn } from "@/utils/ui";

function Row({ layer, depth }: { layer: Layer; depth: number }) {
	const selected = useStudio((s) => s.selection.includes(layer.id));
	const { select, updateLayer } = useStudio.getState();
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
				onDoubleClick={() => {
					const name = window.prompt("Layer name", layer.name);
					if (name) updateLayer({ id: layer.id, update: (l) => ({ ...l, name }) });
				}}
			>
				<span className="text-muted-foreground mr-1 text-[10px] uppercase">{layer.kind}</span>
				{layer.name}
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

/** Layers, top first, with groups. */
export function LayersPanel() {
	const project = useStudio((s) => s.project);
	const selection = useStudio((s) => s.selection);
	if (!project) return null;
	const { commit } = useStudio.getState();
	const top = [...project.layers].reverse();
	const shownGroups = new Set<string>();

	const groupSelection = () => {
		if (selection.length < 1) return;
		const id = newId("g");
		commit((p) => ({
			...p,
			groups: [...p.groups, { id, name: `Group ${p.groups.length + 1}`, collapsed: false }],
			layers: p.layers.map((l) => (selection.includes(l.id) ? { ...l, groupId: id } : l)),
		}));
	};
	const ungroup = (groupId: string) =>
		commit((p) => ({
			...p,
			groups: p.groups.filter((g) => g.id !== groupId),
			layers: p.layers.map((l) => (l.groupId === groupId ? { ...l, groupId: undefined } : l)),
		}));
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
				<button type="button" className="text-muted-foreground hover:text-foreground px-1" onClick={groupSelection} disabled={!selection.length} title="Group selected layers (Ctrl+G)" data-motion-group>
					<Folder className="size-3.5" />
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto py-1">
				{top.map((layer) => {
					const group = layer.groupId ? project.groups.find((g) => g.id === layer.groupId) : null;
					if (!group) return <Row key={layer.id} layer={layer} depth={0} />;
					if (shownGroups.has(group.id)) return null;
					shownGroups.add(group.id);
					const members = top.filter((l) => l.groupId === group.id);
					const allHidden = members.every((m) => !m.visible);
					const allLocked = members.every((m) => m.locked);
					const setAll = (patch: Partial<Pick<Layer, "visible" | "locked">>) =>
						commit((p) => ({ ...p, layers: p.layers.map((l) => (l.groupId === group.id ? { ...l, ...patch } : l)) }));
					return (
						<div key={group.id} data-motion-group-row={group.id}>
							<div className="hover:bg-accent flex items-center gap-1 px-1 py-1 text-xs">
								<button
									type="button"
									aria-label={group.collapsed ? "Expand group" : "Collapse group"}
									onClick={() =>
										commit((p) => ({ ...p, groups: p.groups.map((g) => (g.id === group.id ? { ...g, collapsed: !g.collapsed } : g)) }))
									}
								>
									{group.collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
								</button>
								<button
									type="button"
									className="min-w-0 flex-1 truncate text-left font-medium"
									onClick={() => useStudio.getState().select(members.map((m) => m.id))}
									onDoubleClick={() => ungroup(group.id)}
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
							{!group.collapsed && members.map((m) => <Row key={m.id} layer={m} depth={1} />)}
						</div>
					);
				})}
				{!project.layers.length && <p className="text-muted-foreground px-3 py-6 text-center text-xs">Add a shape, text or picture to start.</p>}
			</div>
		</div>
	);
}
