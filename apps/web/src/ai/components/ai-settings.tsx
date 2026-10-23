"use client";

import { AiSpendingSection } from "./ai-spending";
import { PlatformLimitsSection } from "@/ai-suggest/components/platform-limits";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { aiBridge, type AiProviderId, type AiState } from "../bridge";
import { useAiSettings } from "../store";
import { useTranslationMemory } from "../memory-store";

const KEY_PAGE = "https://aistudio.google.com/app/apikey";

const PROVIDER_INFO: Record<
	AiProviderId,
	{ name: string; keyPage: string; keySite: string; terms: string }
> = {
	gemini: {
		name: "Gemini",
		keyPage: KEY_PAGE,
		keySite: "Google AI Studio",
		terms: "Audio and text you send are processed by Google under your key's terms.",
	},
	claude: {
		name: "Claude",
		keyPage: "https://platform.claude.com/settings/keys",
		keySite: "the Claude Console",
		terms: "Text and frames you send are processed by Anthropic under your key's terms.",
	},
	openai: {
		name: "OpenAI",
		keyPage: "https://platform.openai.com/api-keys",
		keySite: "the OpenAI platform",
		terms: "Text and frames you send are processed by OpenAI under your key's terms.",
	},
};

/** Settings → AI: provider, keys, model and custom vocabulary. */
export function AiSettings() {
	const bridge = aiBridge();
	const [state, setState] = useState<AiState | null>(null);
	const { model, vocabulary, setModel, setVocabulary, provider, setProvider, providerModels, setProviderModel } =
		useAiSettings();
	const [words, setWords] = useState(vocabulary.join("\n"));

	useEffect(() => {
		void bridge?.getState().then(setState);
	}, [bridge]);

	if (!bridge)
		return (
			<p className="text-muted-foreground p-4 text-sm">
				AI features run in the Worksuite FrameFlow desktop app.
			</p>
		);

	return (
		<div className="flex flex-col gap-5 p-4 text-sm" data-ai-settings>
			<section className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold">Provider</h3>
				<p className="text-muted-foreground text-xs">
					Used for translation, clean-up and clip suggestions. Cloud
					transcription always uses Gemini (or local Whisper), because it
					needs audio.
				</p>
				<select
					className="border-input bg-background h-9 rounded-md border px-2"
					aria-label="AI provider"
					value={provider}
					onChange={(e) => setProvider(isProviderId(e.target.value) ? e.target.value : "gemini")}
					data-ai-provider
				>
					<option value="gemini">Google Gemini</option>
					<option value="claude">Anthropic Claude</option>
					<option value="openai">OpenAI</option>
				</select>
			</section>

			<KeySection provider="gemini" state={state} onState={setState} model={model} />
			<section className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold">Gemini model</h3>
				<Input
					placeholder={state?.defaultModel ?? "gemini-2.5-flash"}
					aria-label="Gemini model"
					defaultValue={model}
					onBlur={(e) => setModel(e.target.value)}
				/>
				<p className="text-muted-foreground text-xs">
					Leave empty for the default.
				</p>
			</section>

			{provider !== "gemini" && (
				<>
					<KeySection
						provider={provider}
						state={state}
						onState={setState}
						model={providerModels[provider] ?? ""}
					/>
					<section className="flex flex-col gap-2">
						<h3 className="text-sm font-semibold">{PROVIDER_INFO[provider].name} model</h3>
						<Input
							key={provider}
							placeholder={state?.defaultModels?.[provider] ?? ""}
							aria-label={`${PROVIDER_INFO[provider].name} model`}
							defaultValue={providerModels[provider] ?? ""}
							onBlur={(e) => setProviderModel({ provider, model: e.target.value })}
							data-ai-provider-model
						/>
						<p className="text-muted-foreground text-xs">
							Leave empty for the default. Set its prices under AI spending
							for accurate cost estimates.
						</p>
					</section>
				</>
			)}

			<AiSpendingSection />

			<PlatformLimitsSection />

			<section className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold">Vocabulary</h3>
				<p className="text-muted-foreground text-xs">
					Names, brands and terms AI should spell exactly like this, one per
					line. Used by transcription, clean-up and translation.
				</p>
				<Textarea
					rows={6}
					aria-label="Vocabulary"
					placeholder={"Worksuite\nකොළඹ\nLivezen"}
					value={words}
					onChange={(e) => setWords(e.target.value)}
					onBlur={() => setVocabulary(words.split("\n"))}
					data-ai-vocabulary
				/>
			</section>
			<TranslationMemorySection />
		</div>
	);
}

/** How many corrections translation memory holds, and a way to forget them (AI-37). */
function TranslationMemorySection() {
	const { entries, clear } = useTranslationMemory();
	const projects = new Set(entries.map((e) => e.projectId)).size;
	return (
		<section className="flex flex-col gap-2" data-translation-memory>
			<h3 className="text-sm font-semibold">Translation memory</h3>
			<p className="text-muted-foreground text-xs">
				When you correct a translation, FrameFlow remembers it and shows
				the AI your wording the next time it translates into that language,
				this project&apos;s corrections first.
			</p>
			<div className="flex items-center gap-3 text-sm">
				<span data-memory-count>
					{entries.length} correction{entries.length === 1 ? "" : "s"}
					{entries.length ? ` from ${projects} project${projects === 1 ? "" : "s"}` : ""}
				</span>
				<Button
					size="sm"
					variant="outline"
					disabled={!entries.length}
					onClick={() => {
						if (window.confirm("Forget all translation corrections?")) clear();
					}}
				>
					Clear
				</Button>
			</div>
		</section>
	);
}

function isProviderId(value: string): value is AiProviderId {
	return value === "gemini" || value === "claude" || value === "openai";
}

/** One provider's API key: saved encrypted in the desktop app, never in the page. */
function KeySection({
	provider,
	state,
	onState,
	model,
}: {
	provider: AiProviderId;
	state: AiState | null;
	onState: (state: AiState) => void;
	model: string;
}) {
	const bridge = aiBridge();
	const [key, setKey] = useState("");
	const [busy, setBusy] = useState(false);
	if (!bridge) return null;
	const info = PROVIDER_INFO[provider];
	const saved = provider === "gemini" ? state?.hasKey : state?.keys?.[provider]?.hasKey;
	const remembered = provider === "gemini" ? state?.remembered : state?.keys?.[provider]?.remembered;

	const test = async () => {
		setBusy(true);
		const result = await bridge.test({ model: model || undefined, provider });
		setBusy(false);
		if (result.ok) toast.success(`${info.name} is connected`);
		else toast.error(`${info.name} didn't answer`, { description: result.message });
	};

	return (
		<section className="flex flex-col gap-2" data-ai-key-section={provider}>
			<h3 className="text-sm font-semibold">{info.name} API key</h3>
			<p className="text-muted-foreground text-xs">
				Uses your own key. Get one at{" "}
				<a className="underline" href={info.keyPage} target="_blank" rel="noreferrer">
					{info.keySite}
				</a>
				. {info.terms}
			</p>
			{saved ? (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-constructive text-xs" data-ai-key-status>
						Key saved
						{remembered ? " on this device" : " for this session"}
					</span>
					<Button size="sm" variant="outline" disabled={busy} onClick={() => void test()}>
						Test
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => void bridge.clearKey({ provider }).then(onState)}
					>
						Remove key
					</Button>
				</div>
			) : (
				<form
					className="flex gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						void bridge
							.setKey({ key, provider })
							.then((next) => {
								onState(next);
								setKey("");
								if (!(provider === "gemini" ? next.remembered : next.keys?.[provider]?.remembered))
									toast.info("No system keychain, so the key is kept until you close the app.");
							})
							.catch(() => toast.error("Couldn't save the key"));
					}}
				>
					<Input
						type="password"
						autoComplete="off"
						placeholder="Paste your API key"
						aria-label={`${info.name} API key`}
						value={key}
						onChange={(e) => setKey(e.target.value)}
						data-ai-key-input={provider}
					/>
					<Button type="submit" size="sm" disabled={!key.trim()}>
						Save
					</Button>
				</form>
			)}
			{provider === "gemini" && state && !state.encryption && (
				<p className="text-xs text-amber-600">
					This computer has no keychain, so keys can&apos;t be stored safely and
					are kept only until you close the app.
				</p>
			)}
		</section>
	);
}
