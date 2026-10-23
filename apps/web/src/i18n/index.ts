import { useLocale } from "./store";
import { translate } from "./translate";

export { CATALOGS, translate } from "./translate";

/** Translate outside React (toasts, menus built in code). */
// eslint-disable-next-line opencut/prefer-object-params -- gettext-style t(text, vars) reads best at call sites
export function t(
	text: string,
	vars?: Record<string, string | number>,
): string {
	return translate({ text, locale: useLocale.getState().locale, vars });
}

/** Translate in components; re-renders when the language changes. */
export function useT() {
	const locale = useLocale((s) => s.locale);
	// eslint-disable-next-line opencut/prefer-object-params -- same shape as t()
	return (text: string, vars?: Record<string, string | number>) =>
		translate({ text, locale, vars });
}
