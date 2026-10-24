"use client";

import { LOCALES } from "../locales";
import { useLocale } from "../store";
import { useT } from "..";

/** Interface language picker. */
export function LanguageSelect({ className }: { className?: string }) {
	const { locale, setLocale } = useLocale();
	const t = useT();
	return (
		<select
			className={className ?? "bg-accent/50 h-8 rounded-md border px-2 text-sm"}
			value={locale}
			aria-label={t("Interface language")}
			data-language-select
			onChange={(e) => {
				const next = LOCALES.find((l) => l.code === e.target.value);
				if (next) setLocale(next.code);
			}}
		>
			{LOCALES.map((l) => (
				<option key={l.code} value={l.code}>
					{l.native}
					{l.native !== l.name ? ` (${l.name})` : ""}
					{l.reviewed ? "" : " · machine translation"}
				</option>
			))}
		</select>
	);
}
