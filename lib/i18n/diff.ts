export type Catalog = Record<string, string>;

/**
 * Keys needing (re)translation: missing in target, or whose recorded English
 * source no longer matches the current English source. Human-edited target
 * values survive unless their English changes.
 */
export function keysToTranslate(args: {
  source: Catalog;
  sources: Catalog;
  target: Catalog;
}): string[] {
  const { source, sources, target } = args;
  return Object.keys(source).filter(
    (key) => !(key in target) || (key in sources && sources[key] !== source[key]),
  );
}
