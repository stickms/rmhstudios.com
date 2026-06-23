'use client';

import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { useLocaleStore } from "@/stores/localeStore";

/** Compact language picker (globe + 3 options). */
export function LanguageSwitcher() {
  const { t } = useTranslation("nav");
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  return (
    <label className="flex items-center gap-2 text-sm text-site-text-muted hover:text-site-text transition-colors cursor-pointer" aria-label={t("language", { defaultValue: "Language" })}>
      <Globe className="h-4 w-4 shrink-0" aria-hidden />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="bg-transparent outline-none cursor-pointer text-sm"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
        ))}
      </select>
    </label>
  );
}
