/**
 * Auto-repeat on a focused button — pure.
 *
 * Enter activates a button on every keydown, including the repeats a held key sends. In a lesson,
 * focus moves between the letters and Next as the cards go by, so a held Enter would answer a
 * card, advance, and answer the next one. A repeat is never a deliberate second press: the lesson
 * cancels the default action of a repeating Enter keydown (which is what fires the click) and
 * leaves a first press, a tap and a click alone. Space clicks on keyup, once, so it needs nothing.
 */
export function isHeldActivation(e: { key: string; repeat: boolean }): boolean {
  return e.repeat && e.key === 'Enter';
}
