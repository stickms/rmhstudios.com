/**
 * Note names read inside a sentence. A note name ("C", "F♯4") is Latin text, so in a right-to-left
 * sentence (`ar`, `ur`) the browser's bidi rules can reorder a list of them around the
 * connecting words. Each name is therefore set in a left-to-right isolate (U+2066 … U+2069), the
 * plain-text form of `<bdi dir="ltr">`: it works in the strings the lesson sheet takes (the
 * sentence line, its tooltip, the live region), which cannot hold markup. Pure; client-safe.
 */

const LRI =
  '⁦';
const PDI =
  '⁩';

/** `name` as its own left-to-right run. */
export function isolateLtr(
  name: string,
): string {
  return `${LRI}${name}${PDI}`;
}

/**
 * The names joined as `language` joins a list ("C, E and G"), each set as its own left-to-right
 * run. The connecting words stay in the sentence's own direction.
 */
export function noteList(
  language: string,
  names: readonly string[],
): string {
  const items =
    names.map(
      isolateLtr,
    );
  try {
    return new Intl.ListFormat(
      language,
      {
        style:
          'long',
        type: 'conjunction',
      },
    ).format(
      items,
    );
  } catch {
    return items.join(
      ', ',
    );
  }
}
