/**
 * TF2 localisation: `#Token` → text, from the game's `resource/tf_<language>.txt`.
 *
 * A language file is UTF-16 (sometimes UTF-8) KeyValues:
 *
 *   "lang" { "Language" "English"  "Tokens" { "TF_Hud_Foo" "Foo" … } }
 *
 * The engine resolves a token in the chosen language and falls back to English
 * when that language lacks it; the preview does the same, with English as the
 * default language.
 */

import { parseKv } from './kv/parse';

export interface TfLanguage {
  /** The `<language>` in `tf_<language>.txt`. */
  id: string;
  label: string;
}

export const DEFAULT_LANGUAGE = 'english';

export const TF_LANGUAGES: readonly TfLanguage[] = [
  { id: 'english', label: 'English' },
  { id: 'spanish', label: 'Español' },
  { id: 'latam', label: 'Español (Latinoamérica)' },
  { id: 'french', label: 'Français' },
  { id: 'german', label: 'Deutsch' },
  { id: 'italian', label: 'Italiano' },
  { id: 'portuguese', label: 'Português' },
  { id: 'brazilian', label: 'Português (Brasil)' },
  { id: 'dutch', label: 'Nederlands' },
  { id: 'polish', label: 'Polski' },
  { id: 'czech', label: 'Čeština' },
  { id: 'hungarian', label: 'Magyar' },
  { id: 'romanian', label: 'Română' },
  { id: 'bulgarian', label: 'Български' },
  { id: 'russian', label: 'Русский' },
  { id: 'ukrainian', label: 'Українська' },
  { id: 'greek', label: 'Ελληνικά' },
  { id: 'turkish', label: 'Türkçe' },
  { id: 'danish', label: 'Dansk' },
  { id: 'finnish', label: 'Suomi' },
  { id: 'norwegian', label: 'Norsk' },
  { id: 'swedish', label: 'Svenska' },
  { id: 'schinese', label: '简体中文' },
  { id: 'tchinese', label: '繁體中文' },
  { id: 'japanese', label: '日本語' },
  { id: 'koreana', label: '한국어' },
  { id: 'thai', label: 'ไทย' },
  { id: 'vietnamese', label: 'Tiếng Việt' },
];

export const languageFilePath = (id: string): string => `resource/tf_${id}.txt`;

/** Valve ships these as UTF-16LE with a BOM; accept UTF-8 (with or without BOM) too. */
export function decodeLocalisation(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder('utf-8').decode(bytes.subarray(start));
}

const unescape = (s: string): string =>
  s.replace(/\\(n|t|"|\\)/g, (_m, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));

export interface ParsedLanguage {
  /** The `"Language"` value, lower-cased (`english`, `schinese`…), if present. */
  language: string | undefined;
  /** Lower-case token (no `#`) → text. */
  tokens: Map<string, string>;
}

export function parseLocalisation(text: string): ParsedLanguage {
  const doc = parseKv(text);
  const root = doc.roots.find((n) => n.children);
  const tokens = new Map<string, string>();
  let language: string | undefined;
  for (const c of root?.children ?? []) {
    const k = c.key.text.toLowerCase();
    if (k === 'language' && c.value) language = c.value.text.toLowerCase();
    if (k === 'tokens' && c.children) {
      for (const t of c.children) {
        if (t.value) tokens.set(t.key.text.toLowerCase().replace(/^#/, ''), unescape(t.value.text));
      }
    }
  }
  return { language, tokens };
}

/** Which language a file is for, from its own `"Language"` line. */
export function languageOf(bytes: Uint8Array): string | undefined {
  return parseLocalisation(decodeLocalisation(bytes)).language;
}

const parsed = new WeakMap<Uint8Array, ParsedLanguage>();

/** Parse a language file once per byte array (they are megabytes; the scene rebuilds often). */
export function parseLanguageBytes(bytes: Uint8Array): ParsedLanguage {
  let hit = parsed.get(bytes);
  if (!hit) parsed.set(bytes, (hit = parseLocalisation(decodeLocalisation(bytes))));
  return hit;
}

/**
 * Tokens for `language`, English filling anything it lacks. `readBytes(path)` returns a project/base/imported
 * file's bytes; a HUD's own `resource/tf_<language>.txt` shadows the game's, as in the engine.
 */
export function buildTokens(
  language: string,
  readBytes: (path: string) => Uint8Array | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  const langs = language === DEFAULT_LANGUAGE ? [DEFAULT_LANGUAGE] : [DEFAULT_LANGUAGE, language];
  for (const lang of langs) {
    const bytes = readBytes(languageFilePath(lang));
    if (bytes) for (const [k, v] of parseLanguageBytes(bytes).tokens) out.set(k, v);
  }
  return out;
}

/** Whether a language's file is available from `readBytes`. */
export const hasLanguage = (id: string, has: (path: string) => boolean): boolean =>
  has(languageFilePath(id));
