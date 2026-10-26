/**
 * Keep the browser's font set in step with the HUD's font files.
 *
 * Every `.ttf`/`.otf` the project (or the imported TF2 install) provides is
 * registered under each family name found inside it, plus the `name` the
 * scheme's `CustomFontFiles` gives it, so `font` entries resolve the same way
 * they do in game.
 */

import type { Scheme } from '../scheme/scheme';
import { extOf } from '../project/paths';
import { sha1Hex } from '../util/sha1';
import { registerCustomFont, unregisterCustomFont } from './fonts';
import { readFontNames } from './ttf-names';

const registered = new Map<string, string>(); // family name (lower) → sha1 of file

export async function syncCustomFonts(
  files: ReadonlyMap<string, Uint8Array>,
  scheme: Scheme,
): Promise<boolean> {
  const wanted = new Map<string, { bytes: Uint8Array; sha: string }>();
  const explicit = new Map<string, string>();
  for (const f of scheme.customFontFiles) if (f.name) explicit.set(f.file.toLowerCase(), f.name);

  for (const [path, bytes] of files) {
    if (!['ttf', 'otf'].includes(extOf(path))) continue;
    const sha = sha1Hex(bytes);
    const names = new Set(readFontNames(bytes));
    const named = explicit.get(path.toLowerCase());
    if (named) names.add(named);
    for (const n of names) wanted.set(n.toLowerCase(), { bytes, sha });
  }

  let changed = false;
  for (const name of [...registered.keys()]) {
    if (!wanted.has(name)) {
      unregisterCustomFont(name);
      registered.delete(name);
      changed = true;
    }
  }
  for (const [name, { bytes, sha }] of wanted) {
    if (registered.get(name) === sha) continue;
    try {
      const copy = bytes.slice().buffer as ArrayBuffer;
      await registerCustomFont(name, copy);
      registered.set(name, sha);
      changed = true;
    } catch {
      /* an unreadable font falls back to the placeholder stack */
    }
  }
  return changed;
}
