/**
 * Wire a font file into `clientscheme.res` the way TF2 expects: a numbered entry
 * under `CustomFontFiles`, and a named font under `Fonts` that panels can use.
 */

import { parseKv } from '../kv/parse';
import { kvAt, kvChildren } from '../kv/query';
import { kvSet } from '../kv/edit';

export interface FontRegistration {
  /** Project path of the font file, e.g. `resource/myfont.ttf`. */
  file: string;
  /** Name panels use in `font "…"`. */
  schemeName: string;
  /** Internal family name of the face inside the file. */
  face: string;
  tall: number;
  weight: number;
}

export function registerFontInScheme(schemeText: string, reg: FontRegistration): string {
  const doc = parseKv(schemeText);
  const root = doc.roots.find((n) => n.key.text.toLowerCase() === 'scheme');
  if (!root) return schemeText;
  const rootKey = root.key.text;

  let text = schemeText;
  const files = kvAt(doc, [rootKey, 'CustomFontFiles']);
  const used = files
    ? kvChildren(files)
        .map((c) => Number.parseInt(c.key.text, 10))
        .filter(Number.isFinite)
    : [];
  const already = files
    ? kvChildren(files).some((c) => c.value?.text.toLowerCase() === reg.file.toLowerCase())
    : false;
  if (!already) {
    const next = (used.length ? Math.max(...used) : 0) + 1;
    text = kvSet(text, [rootKey, 'CustomFontFiles', String(next)], reg.file);
  }

  const base = [rootKey, 'Fonts', reg.schemeName, '1'];
  text = kvSet(text, [...base, 'name'], reg.face);
  text = kvSet(text, [...base, 'tall'], String(reg.tall));
  text = kvSet(text, [...base, 'weight'], String(reg.weight));
  text = kvSet(text, [...base, 'antialias'], '1');
  return text;
}
