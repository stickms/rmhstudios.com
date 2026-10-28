/**
 * Edits to `clientscheme.res` made from the colour and font tools. Everything
 * returns new file text and touches only the bytes it must (the parser is
 * lossless), so a scheme with thousands of lines keeps its comments and order.
 */

import { kvAt, kvChildren } from '../kv/query';
import { kvRemove, kvSet } from '../kv/edit';
import { schemeRoot } from './inspect';

function rootKey(text: string): string | undefined {
  return schemeRoot(text).root?.key.text;
}

/** Set (or add) a colour in the `Colors` section. `value` is `"r g b a"` or another colour's name. */
export function setSchemeColor(text: string, name: string, value: string): string {
  const root = rootKey(text);
  return root ? kvSet(text, [root, 'Colors', name], value) : text;
}

/** Set (or add) an entry in `BaseSettings`, the built-in colour names (`FgColor`, `BgColor`…). */
export function setSchemeBase(text: string, name: string, value: string): string {
  const root = rootKey(text);
  return root ? kvSet(text, [root, 'BaseSettings', name], value) : text;
}

/** Change the colour a hop of a name chain stands for, wherever that name is defined. */
export function setSchemeHop(
  text: string,
  hop: { name: string; source: 'colors' | 'base' },
  value: string,
): string {
  return hop.source === 'base'
    ? setSchemeBase(text, hop.name, value)
    : setSchemeColor(text, hop.name, value);
}

export function removeSchemeColor(text: string, name: string): string {
  const root = rootKey(text);
  return root ? kvRemove(text, [root, 'Colors', name]) : text;
}

export type FontProp =
  | 'name'
  | 'tall'
  | 'weight'
  | 'antialias'
  | 'outline'
  | 'dropshadow'
  | 'italic'
  | 'underline'
  | 'additive'
  | 'yres';

/** Set one property of the `index`-th (1-based) face of a scheme font. */
export function setFontFaceProp(
  text: string,
  fontName: string,
  index: number,
  prop: FontProp,
  value: string,
): string {
  const root = rootKey(text);
  return root ? kvSet(text, [root, 'Fonts', fontName, String(index), prop], value) : text;
}

export function removeFontFaceProp(
  text: string,
  fontName: string,
  index: number,
  prop: FontProp,
): string {
  const root = rootKey(text);
  return root ? kvRemove(text, [root, 'Fonts', fontName, String(index), prop]) : text;
}

/** How many numbered faces a scheme font has (for appending the next). */
export function fontFaceCount(text: string, fontName: string): number {
  const { doc, root } = schemeRoot(text);
  if (!root) return 0;
  const font = kvAt(doc, [root.key.text, 'Fonts', fontName]);
  return font ? kvChildren(font).filter((c) => c.children).length : 0;
}

/** Create a scheme font with a single face. */
export function addSchemeFont(
  text: string,
  fontName: string,
  face: { name: string; tall: number; weight: number },
): string {
  let out = text;
  out = setFontFaceProp(out, fontName, 1, 'name', face.name);
  out = setFontFaceProp(out, fontName, 1, 'tall', String(face.tall));
  out = setFontFaceProp(out, fontName, 1, 'weight', String(face.weight));
  out = setFontFaceProp(out, fontName, 1, 'antialias', '1');
  return out;
}
