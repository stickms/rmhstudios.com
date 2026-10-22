export type Catalog = Record<string, string>;

// Legacy catalogs can contain nested values despite the flat Catalog contract.
// Compare their contents, not the identity of separately parsed JSON objects.
const sameValue = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

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
    (key) => !(key in target) || (key in sources && !sameValue(sources[key], source[key])),
  );
}

/** Plan a merge's work, reusing paid translations from the pending PR. */
export function planCatalogTranslations(args: {
  source: Catalog;
  previousSource?: Catalog;
  target: Catalog;
  sources: Catalog;
  previousTarget?: Catalog;
  previousSources?: Catalog;
  pendingTarget?: Catalog;
  pendingSources?: Catalog;
}): { target: Catalog; sources: Catalog; todo: string[] } {
  const { source, previousSource } = args;
  const target = { ...args.target };
  const sources = { ...args.sources };
  for (const [key, english] of Object.entries(args.pendingSources ?? {})) {
    // A translation is reusable only for the same English and when main has
    // not edited its target since the PR branched. Preserve human corrections.
    if (
      english === source[key] &&
      typeof args.pendingTarget?.[key] === 'string' &&
      args.pendingTarget[key].trim() &&
      sameValue(args.target[key], args.previousTarget?.[key]) &&
      sameValue(args.sources[key], args.previousSources?.[key])
    ) {
      target[key] = args.pendingTarget[key];
      sources[key] = english;
    }
  }
  const todo = keysToTranslate({
    source,
    // Old catalogs may predate source tracking. The merge's previous English
    // still lets us identify an outdated translation after an English edit.
    sources: { ...previousSource, ...sources },
    target,
  }).filter((key) => !previousSource || !sameValue(previousSource[key], source[key]));
  return { target, sources, todo };
}

/** Never mark a missing/malformed answer as translated by saving English. */
export function validateTranslationBatch(entries: Catalog, value: unknown): Catalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Translation response must be a JSON object');
  }
  const translated = value as Record<string, unknown>;
  const result: Catalog = {};
  for (const key of Object.keys(entries)) {
    const text = translated[key];
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error(`Translation response is missing key: ${key}`);
    }
    result[key] = text;
  }
  return result;
}
