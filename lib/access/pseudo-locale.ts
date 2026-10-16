/**
 * `en-XA` pseudo-locale (dev only). Accents every letter, pads each string ~40%
 * and brackets it, so untranslated text stands out (no accents), truncation
 * shows up before translators do, and a missing `t()` is obvious at a glance.
 *
 * Not a shipped locale: it is absent from `LOCALES`, and `enablePseudoLocale`
 * is only reachable behind `import.meta.env.DEV` (see components/access/AccessMount).
 */
import type { i18n } from 'i18next';

const MAP: Record<string, string> = {
  a: 'à',
  b: 'ƀ',
  c: 'ç',
  d: 'ð',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'í',
  j: 'ĵ',
  k: 'ķ',
  l: 'ļ',
  m: 'ɱ',
  n: 'ñ',
  o: 'ö',
  p: 'þ',
  q: 'ǫ',
  r: 'ŕ',
  s: 'š',
  t: 'ţ',
  u: 'û',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
  A: 'À',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Ð',
  E: 'É',
  F: 'Ƒ',
  G: 'Ĝ',
  H: 'Ĥ',
  I: 'Í',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ļ',
  M: 'Ṁ',
  N: 'Ñ',
  O: 'Ö',
  P: 'Þ',
  Q: 'Ǫ',
  R: 'Ŕ',
  S: 'Š',
  T: 'Ţ',
  U: 'Û',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ý',
  Z: 'Ž',
};

export function pseudoLocalize(input: string): string {
  if (!input) return input;
  let out = '';
  for (const ch of input) out += MAP[ch] ?? ch;
  const pad = '~'.repeat(Math.ceil(input.length * 0.4));
  return `[${out}${pad}]`;
}

export const PSEUDO_LANG = 'en-XA';

/** Wire the post-processor into an i18next instance and re-render subscribers. */
export function enablePseudoLocale(instance: i18n, on: boolean) {
  instance.use({
    type: 'postProcessor',
    name: 'pseudo',
    process: (value: string) => pseudoLocalize(value),
  });
  instance.options.postProcess = on ? ['pseudo'] : [];
  // Triggers react-i18next's bound re-render without changing the language.
  void instance.changeLanguage(instance.language);
}
