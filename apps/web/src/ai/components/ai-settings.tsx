"use client";

import { AiSpendingSection } from "./ai-spending";
import { PlatformLimitsSection } from "@/ai-suggest/components/platform-limits";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { aiBridge, type AiState } from "../bridge";
import { useAiSettings } from "../store";
import { useTranslationMemory } from "../memory-store";

const KEY_PAGE = "https://aistudio.google.com/app/apikey";

/** Settings → AI: Gemini key, model and custom vocabulary. */
export function AiSettings() {
	const bridge = aiBridge();
	const [state, setState] = useState<AiState | null>(null);
	const [key, setKey] = useState("");
	const [busy, setBusy] = useState(false);
	const { model, vocabulary, setModel, setVocabulary } = useAiSettings();
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

	const test = async () => {
		setBusy(true);
		const result = await bridge.test({ model: model || undefined });
		setBusy(false);
		if (result.ok) toast.success("Gemini is connected");
		else toast.error("Gemini didn't answer", { description: result.message });
	};

	return (
		<div className="flex flex-col gap-5 p-4 text-sm" data-ai-settings>
			<section className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold">Gemini API key</h3>
				<p className="text-muted-foreground text-xs">
					AI translation, clean-up and cloud transcription use Google Gemini
					with your own key. Get one free at{" "}
					<a
						className="underline"
						href={KEY_PAGE}
						target="_blank"
						rel="noreferrer"
					>
						Google AI Studio
					</a>
					. Audio and text you send are processed by Google under your
					key&apos;s terms.
				</p>
				{state?.hasKey ? (
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-constructive text-xs" data-ai-key-status>
							Key saved
							{state.remembered ? " on this device" : " for this session"}
						</span>
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() => void test()}
						>
							Test
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => void bridge.clearKey().then(setState)}
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
								.setKey({ key })
								.then((next) => {
									setState(next);
									setKey("");
									if (!next.remembered)
										toast.info(
											"No system keychain, so the key is kept until you close the app.",
										);
								})
								.catch(() => toast.error("Couldn't save the key"));
						}}
					>
						<Input
							type="password"
							autoComplete="off"
							placeholder="Paste your API key"
							aria-label="Gemini API key"
							value={key}
							onChange={(e) => setKey(e.target.value)}
							data-ai-key-input
						/>
						<Button type="submit" size="sm" disabled={!key.trim()}>
							Save
						</Button>
					</form>
				)}
				{state && !state.encryption && (
					<p className="text-xs text-amber-600">
						This computer has no keychain, so the key can&apos;t be stored
						safely and is kept only until you close the app.
					</p>
				)}
			</section>

			<section className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold">Model</h3>
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
				Gemini your wording the next time it translates into that language,
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
