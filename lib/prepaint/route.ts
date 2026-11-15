/**
 * The route predicate shared by the pre-paint script and the runtime.
 *
 * Pure and dependency-free so it can be bundled into the generated pre-paint
 * script (`lib/prepaint/generated.ts`) AND imported by `components/Providers.tsx`
 * (`isAppThemeRoute`). Before 2026-11 the script carried an ES5 copy that had to
 * be kept in step by hand; now there is exactly one implementation.
 */

/** True when `pathname` is `base` or sits under it, on a SEGMENT boundary (`/rmhcodex` is not under `/rmhcode`). */
export function pathUnder(
  pathname: string,
  base: string,
): boolean {
  return (
    pathname ===
      base ||
    pathname.startsWith(
      `${base}/`,
    )
  );
}

/**
 * Whether a pathname belongs to the app/game tier (no site theme, app chrome
 * background): under one of `excluded`, unless an `exceptions` entry claims it
 * back for the site first.
 */
export function isAppRoute(
  pathname:
    | string
    | undefined
    | null,
  excluded: readonly string[],
  exceptions: readonly string[],
): boolean {
  if (
    !pathname
  )
    return false;
  if (
    exceptions.some(
      (
        b,
      ) =>
        pathUnder(
          pathname,
          b,
        ),
    )
  )
    return false;
  return excluded.some(
    (
      b,
    ) =>
      pathUnder(
        pathname,
        b,
      ),
  );
}
