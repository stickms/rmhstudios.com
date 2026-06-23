import { dirFor, type Locale } from "@/lib/i18n/config";

export function applyHtmlLangDir(
  locale: Locale,
  el: { lang: string; setAttribute(name: string, value: string): void },
): void {
  el.lang = locale;
  el.setAttribute("dir", dirFor(locale));
}
