/**
 * Font families for the preview.
 *
 * The scheme names faces the way the engine does (`"TF2 Build"`, `"Verdana"`).
 * Valve's TF2 faces cannot be bundled, so each is mapped to an open placeholder
 * until the real files are sourced — swapping them is a one-line change in
 * `BUILT_IN`. Fonts a HUD ships in `resource/` (and `CustomFontFiles`) are
 * registered at runtime and win over the built-ins.
 */

const BUILT_IN: Record<string, string> = {
  tf2: '"TF2 Placeholder Display", "Bebas Neue", Impact, "Arial Narrow", sans-serif',
  'tf2 build': '"TF2 Placeholder Display", "Bebas Neue", Impact, "Arial Narrow", sans-serif',
  'tf2 secondary': '"TF2 Placeholder Serif", Georgia, "Times New Roman", serif',
  tf2professor: '"TF2 Placeholder Serif", Georgia, serif',
  verdana: 'Verdana, "DejaVu Sans", sans-serif',
  arial: 'Arial, "Liberation Sans", Helvetica, sans-serif',
  tahoma: 'Tahoma, "DejaVu Sans", sans-serif',
  'trebuchet ms': '"Trebuchet MS", "DejaVu Sans", sans-serif',
  'courier new': '"Courier New", "Liberation Mono", monospace',
  'lucida console': '"Lucida Console", "DejaVu Sans Mono", monospace',
  'times new roman': '"Times New Roman", "Liberation Serif", serif',
  georgia: 'Georgia, "DejaVu Serif", serif',
  'segoe ui': '"Segoe UI", "DejaVu Sans", sans-serif',
  impact: 'Impact, "Bebas Neue", sans-serif',
};

const custom = new Map<string, string>();

const key = (name: string) => name.trim().toLowerCase();

/** CSS `font-family` value for a scheme font name. */
export function fontFamilyFor(name: string): string {
  const k = key(name);
  const registered = custom.get(k);
  if (registered) return `"${registered}", ${BUILT_IN[k] ?? 'sans-serif'}`;
  return BUILT_IN[k] ?? `"${name.replace(/"/g, '')}", Verdana, sans-serif`;
}

export function isBuiltInFont(name: string): boolean {
  return key(name) in BUILT_IN;
}

/** VGUI weight (0–1000, 0 = default) → CSS weight. */
export function cssWeight(weight: number): number {
  if (!weight) return 400;
  return Math.max(100, Math.min(900, Math.round(weight / 100) * 100));
}

export function fontCss(name: string, px: number, weight: number, italic: boolean): string {
  return `${italic ? 'italic ' : ''}${cssWeight(weight)} ${px.toFixed(2)}px ${fontFamilyFor(name)}`;
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

/** Names the user can pick for a scheme font: built-ins first, then registered. */
export function knownFontNames(): string[] {
  return [...new Set([...Object.keys(BUILT_IN), ...custom.keys()])].sort();
}
