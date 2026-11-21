/**
 * The translated label for a value from a label map, or `undefined` when the
 * value is not one the map knows.
 *
 * A label map (`components/settings/settings-nav-labels.ts` and its siblings)
 * is a plain object of literal `t()` calls, so a server-provided string such
 * as a feed category can only be looked up in it, never turned into a key.
 * `Object.hasOwn` keeps a value like `constructor` from matching the object's
 * prototype. The caller shows the raw value when this returns `undefined`.
 */
export function knownLabel(
  labels: Readonly<Record<string, string>>,
  value: string,
): string | undefined {
  return Object.hasOwn(labels, value) ? labels[value] : undefined;
}
