import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from "@/lib/i18n/config";

export const LOCALE_COOKIE = "rmh-lang";

export function parseLocaleCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LOCALE_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const tags = header
    .split(",")
    .map((p) => p.split(";")[0].trim().toLowerCase())
    .filter(Boolean);
  for (const tag of tags) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
    const exact = (LOCALES as readonly string[]).find((l) => l === tag);
    if (exact) return exact as Locale;
  }
  return null;
}

export function resolveLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.cookie)) return input.cookie;
  return matchAcceptLanguage(input.acceptLanguage) ?? DEFAULT_LOCALE;
}
