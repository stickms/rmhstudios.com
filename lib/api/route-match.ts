/**
 * Path matcher for the API route table (third-pass audit AR3).
 *
 * The registered endpoints used to be files under `app/routes/api`, matched by TanStack
 * Router. They are now matched here, behind the one splat route `app/routes/api/$.ts`, so
 * this has to answer exactly as the router did for the same templates:
 *
 *  - a static segment beats a `$param` at the same position, and an earlier position
 *    outweighs a later one (the router scores a match as a binary number with one bit
 *    per static segment, most significant first; a static-first depth-first search with
 *    backtracking finds the same winner);
 *  - static segments compare case-insensitively (the router's default);
 *  - a `$param` never matches an empty segment, and its value is `decodeURIComponent`
 *    of the segment; a segment that does not decode matches nothing;
 *  - one or more trailing slashes are ignored.
 *
 * `lib/api/__tests__/route-match.test.ts` holds these against the router itself, over
 * every template in the real table.
 *
 * Only static and `$param` segments are supported. A splat (`$`), an optional param or a
 * prefixed param is refused at compile time: a route that needs one stays a route file.
 * Pure module (no server imports), so the table test and the docs generator can use it.
 */

export interface RouteMatch<T> {
  value: T;
  /** The template that matched, e.g. `/api/posts/$id/like`. */
  template: string;
  params: Record<string, string>;
}

export interface RouteMatcher<T> {
  match(pathname: string): RouteMatch<T> | null;
  /** Every template, in registration order. */
  readonly templates: readonly string[];
}

interface Node<T> {
  statics: Map<string, Node<T>>;
  param: Node<T> | undefined;
  leaf: { value: T; template: string; names: string[] } | undefined;
}

const newNode = <T>(): Node<T> => ({ statics: new Map(), param: undefined, leaf: undefined });

const PARAM = /^\$[A-Za-z_][A-Za-z0-9_]*$/;
const STATIC = /^[A-Za-z0-9._~-]+$/;

/** `/api/a/$id/` -> `['api', 'a', '$id']`; throws on a segment the matcher does not support. */
export function templateSegments(template: string): string[] {
  if (!template.startsWith('/')) throw new Error(`route template must start with /: ${template}`);
  const trimmed = template.replace(/\/+$/, '');
  const segments = trimmed.split('/').slice(1);
  for (const segment of segments) {
    if (!PARAM.test(segment) && !STATIC.test(segment)) {
      throw new Error(
        `unsupported segment "${segment}" in ${template}: only static and $param segments can be registered`,
      );
    }
  }
  return segments;
}

/** Strip trailing slashes the way the router does before matching (`/` stays `/`). */
export function trimTrailingSlashes(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.replace(/\/+$/, '') : pathname;
}

export function compileRoutes<T>(
  entries: ReadonlyArray<{ path: string; value: T }>,
): RouteMatcher<T> {
  const root = newNode<T>();
  const templates: string[] = [];

  for (const { path, value } of entries) {
    let node = root;
    const names: string[] = [];
    for (const segment of templateSegments(path)) {
      if (segment.startsWith('$')) {
        names.push(segment.slice(1));
        node = node.param ??= newNode<T>();
      } else {
        const key = segment.toLowerCase();
        let next = node.statics.get(key);
        if (!next) node.statics.set(key, (next = newNode<T>()));
        node = next;
      }
    }
    if (node.leaf) {
      throw new Error(`two API routes answer the same path: ${node.leaf.template} and ${path}`);
    }
    if (new Set(names).size !== names.length) {
      throw new Error(`a param name repeats in ${path}`);
    }
    node.leaf = { value, template: path, names };
    templates.push(path);
  }

  function walk(node: Node<T>, parts: string[], index: number, raw: string[]): Node<T> | null {
    if (index === parts.length) return node.leaf ? node : null;
    const part = parts[index]!;
    const viaStatic = node.statics.get(part.toLowerCase());
    if (viaStatic) {
      const found = walk(viaStatic, parts, index + 1, raw);
      if (found) return found;
    }
    if (node.param && part) {
      raw.push(part);
      const found = walk(node.param, parts, index + 1, raw);
      if (found) return found;
      raw.pop();
    }
    return null;
  }

  return {
    templates,
    match(pathname) {
      const parts = trimTrailingSlashes(pathname).split('/').slice(1);
      const raw: string[] = [];
      const node = walk(root, parts, 0, raw);
      if (!node?.leaf) return null;
      // Null prototype, like the router's own params object: a param named `constructor`
      // or `__proto__` is just a key.
      const params: Record<string, string> = Object.create(null) as Record<string, string>;
      try {
        node.leaf.names.forEach((name, i) => {
          params[name] = decodeURIComponent(raw[i]!);
        });
      } catch (error) {
        // The router treats an undecodable path as matching no route.
        if (error instanceof URIError) return null;
        throw error;
      }
      return { value: node.leaf.value, template: node.leaf.template, params };
    },
  };
}
