/**
 * Auto-repeat on a focused button — pure.
 *
 * Enter activates a button on every keydown, including the repeats a held key sends. In a lesson,
 * focus moves between the letters and Next as the cards go by, so a held Enter would answer a
 * card, advance, and answer the next one. A repeat is never a deliberate second press: the lesson
 * cancels the default action of a repeating Enter keydown (which is what fires the click) and
 * leaves a first press, a tap and a click alone. Space clicks on keyup, once, so it needs nothing.
 */
export function isHeldActivation(e: {
  key: string;
  repeat: boolean;
}): boolean {
  return (
    e.repeat &&
    e.key ===
      'Enter'
  );
}

/** The part of an event target this needs: any element (or not an element at all). */
type MaybeElement =
  {
    closest?: (
      selector: string,
    ) => unknown;
  } | null;

/**
 * A held Enter on a control that Enter activates: a button (or anything inside one), or a link
 * with an href. Focus can land on a link when a session ends ("Back to your lessons", "Sign in"),
 * and a browser may follow it on every repeat, so the tag is not enough: an icon inside a button
 * is the event's target as well.
 */
export function isHeldOnControl(e: {
  key: string;
  repeat: boolean;
  target: MaybeElement;
}): boolean {
  if (
    !isHeldActivation(
      e,
    )
  )
    return false;
  return (
    typeof e
      .target
      ?.closest ===
      'function' &&
    !!e.target.closest(
      'button, a[href]',
    )
  );
}
