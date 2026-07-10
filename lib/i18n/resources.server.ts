// Server-only access to every language's i18n resources.
//
// This module is stubbed out of the CLIENT bundle by the stubServerFiles() Vite
// plugin (its name matches *.server.ts), so statically importing all three
// per-language bundles here does NOT pull zh/ar into the client — the server
// build gets them (size is irrelevant there), the client never sees this file.
// On the client, languages are loaded per-chunk via resources.ts's LOCALE_LOADERS.
import type { Locale } from "@/lib/i18n/config";
import type { LocaleBundle } from "@/lib/i18n/resources";
import en from "@/lib/i18n/resources.en";
import zh from "@/lib/i18n/resources.zh";
import ar from "@/lib/i18n/resources.ar";
import hi from "@/lib/i18n/resources.hi";
import es from "@/lib/i18n/resources.es";
import fr from "@/lib/i18n/resources.fr";
import pt from "@/lib/i18n/resources.pt";
import ru from "@/lib/i18n/resources.ru";
import de from "@/lib/i18n/resources.de";
import ja from "@/lib/i18n/resources.ja";
import ko from "@/lib/i18n/resources.ko";
import it from "@/lib/i18n/resources.it";
import id from "@/lib/i18n/resources.id";
import vi from "@/lib/i18n/resources.vi";
import tr from "@/lib/i18n/resources.tr";
import ur from "@/lib/i18n/resources.ur";
import bn from "@/lib/i18n/resources.bn";
import pa from "@/lib/i18n/resources.pa";
import ta from "@/lib/i18n/resources.ta";
import te from "@/lib/i18n/resources.te";
import mr from "@/lib/i18n/resources.mr";
import fa from "@/lib/i18n/resources.fa";
import th from "@/lib/i18n/resources.th";
import pl from "@/lib/i18n/resources.pl";
import uk from "@/lib/i18n/resources.uk";
import nl from "@/lib/i18n/resources.nl";
import fil from "@/lib/i18n/resources.fil";
import ms from "@/lib/i18n/resources.ms";
import ro from "@/lib/i18n/resources.ro";
import el from "@/lib/i18n/resources.el";
import cs from "@/lib/i18n/resources.cs";
import sv from "@/lib/i18n/resources.sv";

const ALL: Record<Locale, LocaleBundle> = {
  en: en as LocaleBundle,
  zh: zh as LocaleBundle,
  ar: ar as LocaleBundle,
  hi: hi as LocaleBundle,
  es: es as LocaleBundle,
  fr: fr as LocaleBundle,
  pt: pt as LocaleBundle,
  ru: ru as LocaleBundle,
  de: de as LocaleBundle,
  ja: ja as LocaleBundle,
  ko: ko as LocaleBundle,
  it: it as LocaleBundle,
  id: id as LocaleBundle,
  vi: vi as LocaleBundle,
  tr: tr as LocaleBundle,
  ur: ur as LocaleBundle,
  bn: bn as LocaleBundle,
  pa: pa as LocaleBundle,
  ta: ta as LocaleBundle,
  te: te as LocaleBundle,
  mr: mr as LocaleBundle,
  fa: fa as LocaleBundle,
  th: th as LocaleBundle,
  pl: pl as LocaleBundle,
  uk: uk as LocaleBundle,
  nl: nl as LocaleBundle,
  fil: fil as LocaleBundle,
  ms: ms as LocaleBundle,
  ro: ro as LocaleBundle,
  el: el as LocaleBundle,
  cs: cs as LocaleBundle,
  sv: sv as LocaleBundle,
};

/** The full resource bundle (all namespaces) for one language. Server use only. */
export function localeResources(locale: Locale): LocaleBundle {
  return ALL[locale] ?? ALL.en;
}
