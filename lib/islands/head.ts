/**
 * Render TanStack-style `head()` objects to HTML, for documents the router does
 * not render (the island document, redesign audit B1).
 *
 * It applies the router's own merge (`buildTagsFromMatches` in
 * @tanstack/react-router's headContentUtils): heads are given root first; `meta`
 * is de-duplicated by `name` / `property` keeping the DEEPEST head's value, the
 * deepest `title` wins, and `links` / `scripts` are concatenated in order with
 * exact duplicates dropped. So a route's `head()` (built with `buildMeta`,
 * `buildCanonical`, `jsonLdScript`) produces the same tags here as it did under
 * the router — `lib/__tests__/islands.test.ts` pins that.
 */

type Attrs = Record<string, string | number | boolean | undefined | null>;
type Meta = Attrs & { title?: string };
type Script = Attrs & { children?: string };

export interface HeadInput {
  meta?: readonly Meta[];
  links?: readonly Attrs[];
  scripts?: readonly Script[];
}

/** React prop names → HTML attribute names, for the ones heads use. */
const ATTR_NAMES: Record<string, string> = {
  charSet: 'charset',
  crossOrigin: 'crossorigin',
  fetchPriority: 'fetchpriority',
  httpEquiv: 'http-equiv',
  hrefLang: 'hreflang',
  referrerPolicy: 'referrerpolicy',
  className: 'class',
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function attrs(a: Attrs): string {
  let out = '';
  for (const [key, value] of Object.entries(a)) {
    if (value === undefined || value === null || value === false || key === 'children') continue;
    const name = ATTR_NAMES[key] ?? key;
    out += value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`;
  }
  return out;
}

/**
 * Script bodies are emitted verbatim, as the router's `<Asset>` does
 * (`dangerouslySetInnerHTML`): JSON-LD from `jsonLdScript` and the pre-paint
 * data block already escape `<`, and the pre-paint code is a fixed string whose
 * hash the CSP names, so it must not be altered by a byte.
 */
function scriptTag(s: Script): string {
  const { children, ...rest } = s;
  return `<script${attrs(rest)}>${children ?? ''}</script>`;
}

/**
 * `nonce` is stamped on every script and link, as the router does for the tags
 * it renders (the policy carries 'strict-dynamic').
 */
export function renderHead(heads: readonly HeadInput[], nonce?: string): string {
  const metas: string[] = [];
  const seen = new Set<string>();
  let title: string | undefined;
  for (let i = heads.length - 1; i >= 0; i--) {
    const list = heads[i]?.meta ?? [];
    for (let j = list.length - 1; j >= 0; j--) {
      const m = list[j];
      if (!m) continue;
      if (m.title) {
        title ??= m.title;
        continue;
      }
      const key = (m.name ?? m.property) as string | undefined;
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      metas.push(`<meta${attrs(m)}>`);
    }
  }
  if (title !== undefined) metas.push(`<title>${escapeHtml(title)}</title>`);
  // The router's `<meta property="csp-nonce">`: client code that injects a script reads the nonce from it.
  if (nonce) metas.push(`<meta${attrs({ property: 'csp-nonce', content: nonce })}>`);
  metas.reverse();

  const unique = (tags: string[]) => [...new Set(tags)];
  const links = unique(
    heads.flatMap((h) => (h.links ?? []).map((l) => `<link${attrs({ ...l, nonce })}>`)),
  );
  const scripts = unique(
    heads.flatMap((h) => (h.scripts ?? []).map((sc) => scriptTag({ ...sc, nonce }))),
  );
  return [...metas, ...links, ...scripts].join('');
}
