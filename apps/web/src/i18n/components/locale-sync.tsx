"use client";

import { useEffect } from "react";
import { localeInfo } from "../locales";
import { useLocale } from "../store";

/** Keeps <html lang dir> in step with the interface language (RTL ready). */
export function LocaleSync() {
	const locale = useLocale((s) => s.locale);
	useEffect(() => {
		const info = localeInfo(locale);
		document.documentElement.lang = locale;
		document.documentElement.dir = info.dir;
	}, [locale]);
	return null;
}
