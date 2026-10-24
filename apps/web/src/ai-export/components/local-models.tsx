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
import { TRANSCRIPTION_MODELS } from "@/transcription/models";
import {
	WHISPER_APPROX_BYTES,
	WHISPER_DEFAULT,
	downloadWhisperModel,
	refreshWhisperModels,
	removeWhisperModel,
	useWhisperModels,
} from "@/transcription/local-models";
import type { TranscriptionModel } from "@/transcription/types";

/** Settings → Local models (SRS EX-20, EX-21, EX-27). */
export function LocalModelsSection() {
	useEffect(() => {
		void refreshInstalledModels();
		void refreshWhisperModels();
	}, []);
	return (
		<div className="flex flex-col gap-3" data-local-models>
			<p className="text-muted-foreground m-0 text-xs">
				These run only on this computer: your video and voice never leave it.
				Each model downloads once from the Worksuite download center and is
				kept on this device.
			</p>
			<h3 className="m-0 mt-1 text-sm font-semibold">Speech to text (Whisper)</h3>
			<p className="text-muted-foreground m-0 text-xs">
				Used by Captions, the transcript and Sync with voice. MIT licence.
			</p>
			{TRANSCRIPTION_MODELS.map((model) => (
				<WhisperRow key={model.id} model={model} />
			))}
			<h3 className="m-0 mt-1 text-sm font-semibold">AI export</h3>
			{AI_MODELS.map((model) => (
				<ModelRow key={model.id} model={model} />
			))}
		</div>
	);
}

function WhisperRow({ model }: { model: TranscriptionModel }) {
	const installed = useWhisperModels((s) => s.installed[model.id]);
	const progress = useWhisperModels((s) => s.progress[model.id]);
	const error = useWhisperModels((s) => s.errors[model.id]);
	return (
		<div
			className="flex flex-col gap-1.5 rounded-md border p-3"
			data-model={model.id}
			data-installed={installed !== undefined ? "yes" : "no"}
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-sm font-medium">Whisper {model.name}</span>
				<span className="text-muted-foreground text-xs">
					{installed
						? formatBytes(installed)
						: `about ${formatBytes(WHISPER_APPROX_BYTES[model.id])}`}
					{model.id === WHISPER_DEFAULT ? " · used for captions" : ""}
				</span>
				<span className="ml-auto flex gap-1.5">
					{installed !== undefined ? (
						<Button size="sm" variant="outline" onClick={() => void removeWhisperModel(model.id)}>
							Remove
						</Button>
					) : progress === undefined ? (
						<Button
							size="sm"
							onClick={() =>
								void downloadWhisperModel(model.id)
									.then(() => toast.success(`Whisper ${model.name} is ready`))
									.catch(() => {})
							}
							data-model-download
						>
							Download
						</Button>
					) : null}
				</span>
			</div>
			<p className="text-muted-foreground m-0 text-xs">{model.description}.</p>
			{progress !== undefined && <Progress value={progress * 100} className="h-1.5" />}
			{error ? <p className="m-0 text-xs text-red-500">{error}</p> : null}
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
