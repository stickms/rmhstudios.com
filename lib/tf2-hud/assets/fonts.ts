/**
 * Font families for the preview.
 *
 * The scheme names faces the way the engine does (`"TF2 Build"`, `"Verdana"`).
 * Three sources, in priority order:
 *
 *   1. **Custom** — fonts the HUD ships (`resource/*.ttf`, `CustomFontFiles`),
 *      registered at runtime under their internal family name. They win, as in game.
 *   2. **Bundled** — the TF2 faces the game itself ships (`TF2`, `TF2 Build`,
 *      `TF2 Secondary`, `TF2 Professor`, `tfd`, `Team Fortress Logo`). They are
 *      declared with `@font-face` in `components/tf2-hud/tf2-hud.css` under their
 *      exact internal names, so a scheme `"name" "TF2 Build"` resolves with no
 *      mapping. They are preview assets only and are never put in an export.
 *   3. **System** — ordinary fonts (Verdana, Arial, …) through a stack with a
 *      metric-compatible fallback, and any other installed family by name.
 */

/** Faces bundled with the editor, by lower-case internal name → display label. */
export const BUNDLED_FACES: Record<string, { name: string; note: string; sample?: string }> = {
  tf2: { name: 'TF2', note: 'Menus and the HUD’s lighter text' },
  'tf2 build': { name: 'TF2 Build', note: 'Heavy display face — scores, health, headings' },
  'tf2 secondary': { name: 'TF2 Secondary', note: 'Item names, descriptions and body text' },
  'tf2 professor': { name: 'TF2 Professor', note: 'The small-caps flourish face' },
  tfd: {
    name: 'tfd',
    note: 'Weapon and class silhouettes (the kill-feed icon font)',
    sample: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789',
  },
  'team fortress logo': {
    name: 'Team Fortress Logo',
    note: 'The wordmark face',
    sample: 'Team Fortress 2',
  },
};

const SYSTEM_STACKS: Record<string, string> = {
  verdana: 'Verdana, "DejaVu Sans", sans-serif',
  arial: 'Arial, "Liberation Sans", Helvetica, sans-serif',
  tahoma: 'Tahoma, "DejaVu Sans", sans-serif',
  'trebuchet ms': '"Trebuchet MS", "DejaVu Sans", sans-serif',
  'courier new': '"Courier New", "Liberation Mono", monospace',
  'lucida console': '"Lucida Console", "DejaVu Sans Mono", monospace',
  'times new roman': '"Times New Roman", "Liberation Serif", serif',
  georgia: 'Georgia, "DejaVu Serif", serif',
  'segoe ui': '"Segoe UI", "DejaVu Sans", sans-serif',
  impact: 'Impact, "Arial Narrow", sans-serif',
};

/** Fallbacks used while a bundled face is still loading. */
const BUNDLED_FALLBACK = 'Impact, "Arial Narrow", Verdana, sans-serif';

const custom = new Map<string, string>();

const key = (name: string) => name.trim().toLowerCase();

/** CSS `font-family` value for a scheme font name. */
export function fontFamilyFor(name: string): string {
  const k = key(name);
  const registered = custom.get(k);
  if (registered) return `"${registered}", ${SYSTEM_STACKS[k] ?? 'sans-serif'}`;
  const bundled = BUNDLED_FACES[k];
  if (bundled) return `"${bundled.name}", ${BUNDLED_FALLBACK}`;
  return SYSTEM_STACKS[k] ?? `"${name.replace(/"/g, '')}", Verdana, sans-serif`;
}

export function isBuiltInFont(name: string): boolean {
  const k = key(name);
  return k in SYSTEM_STACKS || k in BUNDLED_FACES;
}

let bundledLoad: Promise<void> | undefined;

/**
 * Make sure the bundled faces are loaded before the canvas paints with them (a
 * canvas does not wait for a face it merely names). Resolves once all six have
 * either loaded or failed; failure just leaves the fallback stack in use.
 */
export function ensureBundledFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  bundledLoad ??= Promise.all(
    Object.values(BUNDLED_FACES).map((f) =>
      document.fonts.load(`16px "${f.name}"`).catch(() => []),
    ),
  ).then(() => undefined);
  return bundledLoad;
}

/** VGUI weight (0–1000, 0 = default) → CSS weight. */
export function cssWeight(weight: number): number {
  if (!weight) return 400;
  return Math.max(100, Math.min(900, Math.round(weight / 100) * 100));
}

export function fontCss(name: string, px: number, weight: number, italic: boolean): string {
  return `${italic ? 'italic ' : ''}${cssWeight(weight)} ${px.toFixed(2)}px ${fontFamilyFor(name)}`;
}

export type FontStatus = 'custom' | 'bundled' | 'system' | 'missing';

/**
 * Where a scheme face's glyphs will come from: a file the HUD ships, a TF2 face
 * the editor bundles, a font the browser has, or nothing (it will fall back, so
 * the preview will not match the game).
 */
export function fontStatus(name: string, installed: (family: string) => boolean): FontStatus {
  const k = key(name);
  if (custom.has(k)) return 'custom';
  if (k in BUNDLED_FACES) return 'bundled';
  if (k in SYSTEM_STACKS) return installed(name) ? 'system' : 'missing';
  return installed(name) ? 'system' : 'missing';
}

let counter = 0;

/**
 * Make a font file available under `schemeName` for subsequent paints.
 * Resolves to the generated family name; rejects on an unreadable font.
 */
export async function registerCustomFont(schemeName: string, data: ArrayBuffer): Promise<string> {
  const family = `tf2hud-${key(schemeName).replace(/[^a-z0-9]+/g, '-')}-${++counter}`;
  const face = new FontFace(family, data);
  await face.load();
  document.fonts.add(face);
  custom.set(key(schemeName), family);
  return family;
}

export function unregisterCustomFont(schemeName: string): void {
  custom.delete(key(schemeName));
}

export function registeredCustomFonts(): string[] {
  return [...custom.keys()];
}

export interface FontGroups {
  /** TF2 faces bundled with the editor. */
  bundled: string[];
  /** Fonts the current HUD ships. */
  custom: string[];
  /** Common system fonts the scheme can name. */
  system: string[];
}

/** Every face name a scheme font can use, grouped by where it comes from. */
export function fontGroups(): FontGroups {
  return {
    bundled: Object.values(BUNDLED_FACES).map((f) => f.name),
    custom: [...custom.keys()].filter((k) => !(k in BUNDLED_FACES)).sort(),
    system: [
      'Verdana',
      'Arial',
      'Tahoma',
      'Trebuchet MS',
      'Segoe UI',
      'Georgia',
      'Times New Roman',
      'Courier New',
      'Lucida Console',
      'Impact',
    ],
  };
}

/** Names the user can pick for a scheme font: bundled, custom, then system. */
export function knownFontNames(): string[] {
  const g = fontGroups();
  return [...g.bundled, ...g.custom, ...g.system];
}
