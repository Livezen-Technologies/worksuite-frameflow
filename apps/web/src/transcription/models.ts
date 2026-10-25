import type {
	TranscriptionModel,
	TranscriptionModelId,
} from "./types";

export const TRANSCRIPTION_MODELS: TranscriptionModel[] = [
	{
		id: "whisper-tiny",
		name: "Tiny",
		huggingFaceId: "onnx-community/whisper-tiny",
		description: "Fastest, lower accuracy",
	},
	{
		id: "whisper-small",
		name: "Small",
		huggingFaceId: "onnx-community/whisper-small",
		description: "Good balance of speed and accuracy",
	},
	{
		id: "whisper-medium",
		name: "Medium",
		huggingFaceId: "onnx-community/whisper-medium-ONNX",
		description: "Higher accuracy, slower",
	},
	{
		id: "whisper-large-v3-turbo",
		name: "Large v3 Turbo",
		huggingFaceId: "onnx-community/whisper-large-v3-turbo",
		description: "Best accuracy, requires WebGPU for good performance",
	},
	{
		id: "whisper-small-si",
		name: "Small · Sinhala",
		huggingFaceId: "SinhaSpeech/whisper-small-sinhala-run11",
		description: "Whisper Small fine-tuned for Sinhala (WER 16%). Used automatically for Sinhala.",
		language: "si",
		release: { repo: "Livezen-Technologies/worksuite-frameflow", tag: "model-whisper-small-si" },
	},
];

/** The model to use for a language: a language-specific one when installed or downloadable. */
export function modelForLanguage({ language, modelId }: { language: string; modelId: TranscriptionModelId }): TranscriptionModelId {
	const specific = TRANSCRIPTION_MODELS.find((m) => m.language && m.language === language);
	return specific ? specific.id : modelId;
}

export const DEFAULT_TRANSCRIPTION_MODEL: TranscriptionModelId =
	"whisper-small";
