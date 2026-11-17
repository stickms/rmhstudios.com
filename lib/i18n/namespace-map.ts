/**
 * Turn a Vite `import.meta.glob('/locales/<lng>/*.json')` result into the
 * namespace -> loader map `resources.ts` expects (`/locales/fr/c-blog.json` ->
 * `c-blog`). Each loader stays a lazy `import()`, so Vite still emits one chunk
 * per namespace and nothing is fetched until i18next asks for it.
 */
export function namespaceMap(
  glob: Record<
    string,
    () => Promise<unknown>
  >,
): Record<
  string,
  () => Promise<{
    default: unknown;
  }>
> {
  const map: Record<
    string,
    () => Promise<{
      default: unknown;
    }>
  > =
    {};
  for (const [
    path,
    load,
  ] of Object.entries(
    glob,
  )) {
    const ns =
      path.slice(
        path.lastIndexOf(
          '/',
        ) +
          1,
        -'.json'
          .length,
      );
    map[
      ns
    ] =
      load as () => Promise<{
        default: unknown;
      }>;
  }
  return map;
}
