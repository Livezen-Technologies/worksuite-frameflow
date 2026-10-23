"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/account/components/account-menu";
import {
	AI_MODELS,
	downloadModel,
	importModel,
	refreshInstalledModels,
	removeModel,
	useAiModels,
	type AiModelInfo,
} from "../models";

/** Settings → Local models (SRS EX-20, EX-21, EX-27). */
export function LocalModelsSection() {
	useEffect(() => {
		void refreshInstalledModels();
	}, []);
	return (
		<div className="flex flex-col gap-3" data-local-models>
			<p className="text-muted-foreground m-0 text-xs">
				AI export runs only on this computer: frames never leave it. Each
				model downloads once and is kept on this device.
			</p>
			{AI_MODELS.map((model) => (
				<ModelRow key={model.id} model={model} />
			))}
		</div>
	);
}

export function ModelRow({
	model,
	compact = false,
}: {
	model: AiModelInfo;
	compact?: boolean;
}) {
	const installed = useAiModels((s) => s.installed[model.id]);
	const progress = useAiModels((s) => s.progress[model.id]);
	const error = useAiModels((s) => s.errors[model.id]);
	const fileInput = useRef<HTMLInputElement>(null);
	const download = () =>
		void downloadModel(model.id)
			.then(() => toast.success(`${model.name} is ready`))
			.catch(() => {});
	return (
		<div
			className="flex flex-col gap-1.5 rounded-md border p-3"
			data-model={model.id}
			data-installed={installed ? "yes" : "no"}
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-sm font-medium">{model.name}</span>
				<span className="text-muted-foreground text-xs">
					{model.licence} ·{" "}
					{installed ? formatBytes(installed) : `about ${formatBytes(model.approxBytes)}`}
				</span>
				<span className="ml-auto flex gap-1.5">
					{installed ? (
						<Button size="sm" variant="outline" onClick={() => void removeModel(model.id)}>
							Remove
						</Button>
					) : progress === undefined ? (
						<>
							<Button size="sm" onClick={download} data-model-download>
								Download
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={() => fileInput.current?.click()}
							>
								Use a file…
							</Button>
						</>
					) : null}
				</span>
				<input
					ref={fileInput}
					type="file"
					accept=".onnx"
					className="hidden"
					aria-label={`Model file for ${model.name}`}
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file)
							void importModel({ id: model.id, file }).then(() =>
								toast.success(`${model.name} is ready`),
							);
						e.target.value = "";
					}}
				/>
			</div>
			{!compact && <p className="text-muted-foreground m-0 text-xs">{model.about}</p>}
			{progress !== undefined && <Progress value={progress * 100} className="h-1.5" />}
			{error ? (
				<p className="m-0 text-xs text-red-500">
					{error}. You can also download the .onnx file yourself and choose
					&ldquo;Use a file…&rdquo;.
				</p>
			) : null}
		</div>
	);
}
