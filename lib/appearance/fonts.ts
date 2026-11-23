/**
 * The reader's fonts (owner, 2026-11-23): a main face (chrome, headings, everything), a reading face (`.t-post`,
 * `.t-prose`) and a mono face (`.t-meta`, code), each chosen from a fixed, self-hosted catalogue. DM Sans and DM Mono
 * are the defaults. Design: docs/superpowers/specs/2026-11-23-font-choice-and-appearance-sync-design.md.
 *
 * Client-safe and zod-free (like ./prefs): the root loader, the pre-paint config, the settings panel and the store all
 * import it. The faces themselves are generated stylesheets (app/fonts/choice/<id>.css, ./font-assets.ts); only the
 * defaults ride the site sheet, so a visitor downloads only the faces they use.
 */

export type FontSlot = 'main' | 'reading' | 'mono';

export const TEXT_FONT_IDS = [
  'dm-sans',
  'inter',
  'geist',
  'ibm-plex-sans',
  'public-sans',
  'charter',
  'source-serif-4',
  'literata',
  'newsreader',
  'lora',
  'merriweather',
  'spectral',
] as const;
export const MONO_FONT_IDS = ['dm-mono', 'jetbrains-mono', 'geist-mono', 'ibm-plex-mono'] as const;

export type TextFontId = (typeof TEXT_FONT_IDS)[number];
export type MonoFontId = (typeof MONO_FONT_IDS)[number];
export type FontId = TextFontId | MonoFontId;
/** `same` = the reading face follows the main face. */
export type ReadingFontId = TextFontId | 'same';

export interface FontChoice {
  main: TextFontId;
  reading: ReadingFontId;
  mono: MonoFontId;
}

export interface FontEntry {
  id: FontId;
  /** The name shown in settings (not translated: it is a typeface's name). */
  label: string;
  kind: 'sans' | 'serif' | 'mono';
  /** The CSS family name the generated `@font-face` rules declare. */
  family: string;
}

export const FONT_CATALOGUE: ReadonlyArray<FontEntry> = [
  { id: 'dm-sans', label: 'DM Sans', kind: 'sans', family: 'DM Sans' },
  { id: 'inter', label: 'Inter', kind: 'sans', family: 'Inter' },
  { id: 'geist', label: 'Geist', kind: 'sans', family: 'Geist' },
  { id: 'ibm-plex-sans', label: 'IBM Plex Sans', kind: 'sans', family: 'IBM Plex Sans' },
  { id: 'public-sans', label: 'Public Sans', kind: 'sans', family: 'Public Sans' },
  // Charis SIL is the open-source face built from Bitstream Charter (Medium's reading face).
  { id: 'charter', label: 'Charter', kind: 'serif', family: 'Charis SIL' },
  { id: 'source-serif-4', label: 'Source Serif 4', kind: 'serif', family: 'Source Serif 4' },
  { id: 'literata', label: 'Literata', kind: 'serif', family: 'Literata' },
  { id: 'newsreader', label: 'Newsreader', kind: 'serif', family: 'Newsreader' },
  { id: 'lora', label: 'Lora', kind: 'serif', family: 'Lora' },
  { id: 'merriweather', label: 'Merriweather', kind: 'serif', family: 'Merriweather' },
  { id: 'spectral', label: 'Spectral', kind: 'serif', family: 'Spectral' },
  { id: 'dm-mono', label: 'DM Mono', kind: 'mono', family: 'DM Mono' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', kind: 'mono', family: 'JetBrains Mono' },
  { id: 'geist-mono', label: 'Geist Mono', kind: 'mono', family: 'Geist Mono' },
  { id: 'ibm-plex-mono', label: 'IBM Plex Mono', kind: 'mono', family: 'IBM Plex Mono' },
];

export const DEFAULT_FONTS: FontChoice = { main: 'dm-sans', reading: 'same', mono: 'dm-mono' };

/** localStorage keys, one per slot (absent = the default). */
export const FONT_KEYS: Record<FontSlot, string> = {
  main: 'rmh-font-main',
  reading: 'rmh-font-reading',
  mono: 'rmh-font-mono',
};
/** localStorage: `'0'` = appearance sync is off on this device; absent = on. */
export const APPEARANCE_SYNC_KEY = 'rmh-appearance-sync';
/** localStorage: ms epoch of this device's last appearance change (the "most recent wins" merge). */
export const APPEARANCE_CHANGED_AT_KEY = 'rmh-appearance-changed-at';
/** Cookie mirror of the choice, `main.reading.mono`, so the server renders the right faces. */
export const FONTS_COOKIE = 'rmh-fonts';
/** Cookie mirror of the sync switch (`0` = off), so the server skips the account seed for this device. */
export const APPEARANCE_SYNC_COOKIE = 'rmh-appearance-sync';

const TEXT = new Set<string>(TEXT_FONT_IDS);
const MONO = new Set<string>(MONO_FONT_IDS);

export function isFontFor(slot: FontSlot, v: unknown): boolean {
  if (typeof v !== 'string') return false;
  if (slot === 'mono') return MONO.has(v);
  if (slot === 'reading' && v === 'same') return true;
  return TEXT.has(v);
}

export function fontEntry(id: FontId): FontEntry | undefined {
  return FONT_CATALOGUE.find((f) => f.id === id);
}

/** A choice from untrusted parts: anything that is not a valid id for its slot is that slot's default. */
export function normalizeFonts(partial: Partial<Record<FontSlot, unknown>>): FontChoice {
  return {
    main: isFontFor('main', partial.main) ? (partial.main as TextFontId) : DEFAULT_FONTS.main,
    reading: isFontFor('reading', partial.reading) ? (partial.reading as ReadingFontId) : DEFAULT_FONTS.reading,
    mono: isFontFor('mono', partial.mono) ? (partial.mono as MonoFontId) : DEFAULT_FONTS.mono,
  };
}

function cookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=').trim();
  }
  return null;
}

export function parseFontsCookie(cookieHeader: string | null | undefined): FontChoice | null {
  const raw = cookieValue(cookieHeader, FONTS_COOKIE);
  if (raw == null) return null;
  const [main, reading, mono] = raw.split('.');
  return normalizeFonts({ main, reading, mono });
}

export function formatFontsCookie(choice: FontChoice): string | null {
  if (
    choice.main === DEFAULT_FONTS.main &&
    choice.reading === DEFAULT_FONTS.reading &&
    choice.mono === DEFAULT_FONTS.mono
  ) {
    return null;
  }
  return `${choice.main}.${choice.reading}.${choice.mono}`;
}

/** The distinct non-default faces this choice draws text in (`same` resolves to the main face). */
export function fontsInUse(choice: FontChoice): FontId[] {
  const reading = choice.reading === 'same' ? choice.main : choice.reading;
  const out: FontId[] = [];
  for (const id of [choice.main, reading, choice.mono] as FontId[]) {
    if (id !== 'dm-sans' && id !== 'dm-mono' && !out.includes(id)) out.push(id);
  }
  return out;
}

export function appearanceSyncOff(cookieHeader: string | null | undefined): boolean {
  return cookieValue(cookieHeader, APPEARANCE_SYNC_COOKIE) === '0';
}
