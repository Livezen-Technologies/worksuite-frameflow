"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearAiCache } from "../cache";
import { aboutUsd, formatUsd, pricesFor, type CostEstimate } from "../cost";
import { monthKey, useAiSpend } from "../spend";
import { useAiSettings } from "../store";

/** Settings → AI: monthly spending cap, spend so far, prices, cache (AI-47, AI-49). */
export function AiSpendingSection() {
	const capUsd = useAiSpend((s) => s.capUsd);
	const month = useAiSpend((s) => s.month);
	const spentUsd = useAiSpend((s) => s.spentUsd);
	const recent = useAiSpend((s) => s.recent);
	const overrides = useAiSpend((s) => s.prices);
	const setCap = useAiSpend((s) => s.setCap);
	const setPrices = useAiSpend((s) => s.setPrices);
	const resetMonth = useAiSpend((s) => s.resetMonth);
	const model = useAiSettings((s) => s.model) || "gemini-2.5-flash";
	const prices = pricesFor({ model, overrides });
	const spent = month === monthKey() ? spentUsd : 0;
	const [cap, setCapText] = useState(String(capUsd));
	return (
		<section className="flex flex-col gap-2" data-ai-spending>
			<h3 className="text-sm font-semibold">Spending</h3>
			<p className="text-muted-foreground text-xs">
				Each AI job shows its estimated cost first. Jobs that would go over
				your monthly cap don&apos;t run. Spend is worked out from the tokens
				Gemini reports, using the prices below.
			</p>
			<div className="flex items-end gap-2">
				<div className="flex flex-col gap-1">
					<Label htmlFor="ai-cap" className="text-xs">
						Monthly cap (USD, 0 = none)
					</Label>
					<Input
						id="ai-cap"
						type="number"
						min={0}
						step={0.5}
						className="h-8 w-28"
						value={cap}
						onChange={(e) => setCapText(e.target.value)}
						onBlur={() => setCap(Number(cap))}
					/>
				</div>
				<span className="text-xs" data-ai-spent>
					This month: {formatUsd(spent)}
					{capUsd > 0 ? ` of ${formatUsd(capUsd)}` : ""}
				</span>
				<Button size="sm" variant="ghost" onClick={resetMonth}>
					Reset
				</Button>
			</div>
			<div className="grid grid-cols-3 gap-2">
				{(["input", "audio", "output"] as const).map((key) => (
					<div key={key} className="flex flex-col gap-1">
						<Label htmlFor={`ai-price-${key}`} className="text-muted-foreground text-[11px]">
							{key === "input" ? "Text/image in" : key === "audio" ? "Audio in" : "Output"} $/1M
						</Label>
						<Input
							id={`ai-price-${key}`}
							type="number"
							min={0}
							step={0.05}
							className="h-8"
							defaultValue={prices[key]}
							onBlur={(e) =>
								setPrices({ model, prices: { ...prices, [key]: Number(e.target.value) || 0 } })
							}
						/>
					</div>
				))}
			</div>
			{recent.length > 0 && (
				<ul className="text-muted-foreground m-0 flex list-none flex-col gap-0.5 p-0 text-[11px]" data-ai-recent>
					{recent.slice(0, 5).map((entry) => (
						<li key={entry.at}>
							{new Date(entry.at).toLocaleString()} · {entry.kind} ·{" "}
							{entry.cached ? "from cache, free" : formatUsd(entry.usd)}
						</li>
					))}
				</ul>
			)}
			<Button
				size="sm"
				variant="outline"
				className="w-fit"
				onClick={() => void clearAiCache().then(() => toast.success("AI cache cleared"))}
			>
				Clear cached AI results
			</Button>
		</section>
	);
}

/** "About $0.02 · $0.40 of $5 used this month" next to an AI action (AI-47). */
export function AiCostNote({ estimate }: { estimate: CostEstimate }) {
	const capUsd = useAiSpend((s) => s.capUsd);
	const month = useAiSpend((s) => s.month);
	const spentUsd = useAiSpend((s) => s.spentUsd);
	const spent = month === monthKey() ? spentUsd : 0;
	const over = capUsd > 0 && spent + estimate.usd > capUsd;
	return (
		<p
			className={over ? "m-0 text-[11px] text-red-500" : "text-muted-foreground m-0 text-[11px]"}
			data-ai-cost
		>
			Estimated cost {aboutUsd(estimate.usd)}
			{capUsd > 0 ? ` · ${formatUsd(spent)} of ${formatUsd(capUsd)} used this month` : ""}
			{over ? " · over your cap" : ""}. Repeats of the same job are free.
		</p>
	);
}
