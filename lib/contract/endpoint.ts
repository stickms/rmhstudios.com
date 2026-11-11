/**
 * Typed API contracts — the one place a site endpoint's shape is written down
 * (redesign audit C1, `docs/plans/2026-11-09-ground-up-redesign-audit.md`).
 *
 * ## The problem this solves
 *
 * The client called the site API through ~840 raw string fetches of `/api/…` URLs.
 * Every call site re-declared the response shape by hand (or cast it), and the
 * server's zod schemas — which `defineHandler` already validates against — were
 * thrown away at the wire. A renamed field or a moved route compiled fine and
 * broke at runtime.
 *
 * ## The shape
 *
 * A contract is a tiny RUNTIME descriptor (method + path template) carrying the
 * request/response TYPES as phantom generics. It is client-safe and costs a few
 * bytes: no zod at runtime on the client (zod is on the entry's forbidden list,
 * `scripts/check-entry-composition.ts`).
 *
 * ```ts
 * // lib/<domain>/<name>.contract.ts — imported by the client AND the route
 * import type { z } from 'zod';
 * import type { transferBody, transferRes } from './wallet-schema';
 * export const walletTransfer = endpoint<{
 *   body: z.infer<typeof transferBody>;
 *   res: z.infer<typeof transferRes>;
 * }>()({ method: 'POST', path: '/api/wallet/transfer' });
 * ```
 *
 * The server binds it with `implement()` (`lib/api/implement.server.ts`), which
 * wraps `defineHandler` and makes the compiler check that the zod schemas it is
 * handed parse to exactly the contract's types and that the handler returns the
 * contract's response. The client calls it with `api()` (`./client.ts`).
 *
 * Path templates use TanStack's `$param` spelling, the same as the route file
 * (`/api/communities/$id/members`), so a contract reads like its route.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** The type half of a contract. Every key is optional except `res`. */
export interface ContractTypes {
  /** Route params (`$id` → `{ id: string }`). Derived from the path when omitted. */
  params?: Record<string, string>;
  /** Parsed `?query` (what the route's `query` schema infers). */
  query?: Record<string, unknown>;
  /**
   * Parsed JSON body (what the route's `body` schema infers). Declare `FormData` for a
   * multipart upload: `api()` sends it untouched (no `Content-Type`, so the browser adds
   * the boundary) and the route reads `request.formData()` itself, with no zod body.
   */
  body?: unknown;
  /** The JSON the route returns on success. */
  res: unknown;
}

/** `'/api/a/$id/b/$slug'` → `'id' | 'slug'`. */
export type PathParamNames<P extends string> = P extends `${string}$${infer Name}/${infer Rest}`
  ? Name | PathParamNames<`/${Rest}`>
  : P extends `${string}$${infer Name}`
    ? Name
    : never;

export type ParamsOf<P extends string> = [PathParamNames<P>] extends [never]
  ? undefined
  : { [K in PathParamNames<P>]: string };

export interface Endpoint<T extends ContractTypes = ContractTypes, P extends string = string> {
  readonly method: HttpMethod;
  readonly path: P;
  /** Phantom: never set at runtime. Carries the types to `api()` and `implement()`. */
  readonly __types?: T;
}

/**
 * Declare an endpoint. Curried so the types are given explicitly while the
 * path literal is still inferred: `endpoint<{ res: X }>()({ method, path })`.
 */
export function endpoint<T extends ContractTypes>() {
  return <const P extends string>(spec: { method: HttpMethod; path: P }): Endpoint<T, P> => {
    if (!spec.path.startsWith('/api/')) {
      throw new Error(`contract path must start with /api/: ${spec.path}`);
    }
    return Object.freeze({ method: spec.method, path: spec.path });
  };
}

/* ── Type accessors used by api() and implement() ─────────────────────────── */

type Types<E> = E extends Endpoint<infer T, string> ? T : never;
export type ResOf<E> = Types<E>['res'];
export type BodyOf<E> = Types<E> extends { body: infer B } ? B : undefined;
export type QueryOf<E> = Types<E> extends { query: infer Q } ? Q : undefined;
export type ParamsOfEndpoint<E> =
  Types<E> extends { params: infer P }
    ? P
    : E extends Endpoint<ContractTypes, infer Path>
      ? ParamsOf<Path>
      : undefined;

/**
 * Fill a `$param` path template. Every param is URI-encoded; a missing param
 * throws rather than producing `/api/x/undefined`.
 */
export function buildPath(template: string, params?: Record<string, string>): string {
  return template.replace(/\$([A-Za-z0-9_]+)/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined || value === '') {
      throw new Error(`missing path param "${name}" for ${template}`);
    }
    return encodeURIComponent(value);
  });
}

/**
 * Serialise a query object the way `defineHandler` parses it back (a flat
 * string record): `undefined`/`null` are dropped, arrays repeat the key,
 * everything else is `String(value)`.
 */
export function buildQuery(query?: Record<string, unknown>): string {
  if (!query) return '';
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const v of value) sp.append(key, String(v));
    else sp.append(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
