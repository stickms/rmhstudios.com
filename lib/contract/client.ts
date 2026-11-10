/**
 * The typed client for site API contracts (redesign audit C1).
 *
 * `api(contract, input)` builds the URL from the contract's `$param` template,
 * sends the body as JSON, and returns the contract's response type. Transport
 * behaviour — timeout, credentials, typed `HttpError` with the server's
 * `{ error }` message, GET-only retries with jittered backoff — is
 * `fetchJson` (`lib/http.ts`), so a contract call fails exactly the way the
 * rest of the client already expects.
 *
 * ```ts
 * const { balance } = await api(walletGet);
 * await api(walletTransfer, { body: { to, amount } });
 * const posts = await api(communityPosts, { params: { id }, query: { cursor } });
 * ```
 *
 * With React Query, `apiQuery(contract, input)` yields `{ queryKey, queryFn }`
 * whose key starts with the path template, so `invalidateQueries({ queryKey:
 * [contract.path] })` drops every cached call of one endpoint.
 */

import { fetchJson, type FetchJsonOptions } from '@/lib/http';

/** Read a field (`reason`, `code`, …) off a failed call's JSON error body. */
export { errorField } from '@/lib/http';
import {
  buildPath,
  buildQuery,
  type BodyOf,
  type Endpoint,
  type ParamsOfEndpoint,
  type QueryOf,
  type ResOf,
} from './endpoint';

/**
 * Model calls are slower than the 15s default `api()` timeout (the raw fetches
 * they replace had none), so they pass this ceiling (`timeoutMs: AI_TIMEOUT_MS`).
 */
export const AI_TIMEOUT_MS = 60_000;

type Transport = Pick<FetchJsonOptions, 'signal' | 'timeoutMs' | 'retries' | 'headers'>;

/** Keys whose type is `undefined` become absent; the rest are required. */
type Slot<K extends string, V> = [V] extends [undefined] ? { [P in K]?: undefined } : { [P in K]: V };

export type ApiInput<E> = Slot<'params', ParamsOfEndpoint<E>> &
  Slot<'body', BodyOf<E>> & { query?: QueryOf<E> } & Transport;

type NeedsInput<E> = [ParamsOfEndpoint<E>] extends [undefined]
  ? [BodyOf<E>] extends [undefined]
    ? false
    : true
  : true;

/** The URL a contract call goes to (exported for SSE/EventSource and `<a href>` uses). */
export function apiUrl<E extends Endpoint>(
  e: E,
  input?: { params?: Record<string, string>; query?: Record<string, unknown> },
): string {
  return buildPath(e.path, input?.params) + buildQuery(input?.query);
}

export function api<E extends Endpoint>(
  e: E,
  ...[input]: NeedsInput<E> extends true ? [ApiInput<E>] : [ApiInput<E>?]
): Promise<ResOf<E>> {
  const i = (input ?? {}) as {
    params?: Record<string, string>;
    query?: Record<string, unknown>;
    body?: unknown;
  } & Transport;
  const url = apiUrl(e, i);
  const hasBody = i.body !== undefined && e.method !== 'GET';
  const opts: FetchJsonOptions = {
    method: e.method,
    retries: i.retries ?? (e.method === 'GET' ? 1 : 0),
  };
  if (i.signal !== undefined) opts.signal = i.signal;
  if (i.timeoutMs !== undefined) opts.timeoutMs = i.timeoutMs;
  if (hasBody) {
    opts.headers = { 'Content-Type': 'application/json', ...i.headers };
    opts.body = JSON.stringify(i.body);
  } else if (i.headers !== undefined) {
    opts.headers = i.headers;
  }
  return fetchJson<ResOf<E>>(url, opts);
}

/** React Query options for a contract call. The key is `[path, params, query]`. */
export function apiQuery<E extends Endpoint>(
  e: E,
  ...[input]: NeedsInput<E> extends true ? [ApiInput<E>] : [ApiInput<E>?]
) {
  const i = (input ?? {}) as { params?: unknown; query?: unknown };
  return {
    queryKey: [e.path, i.params ?? null, i.query ?? null] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      (api as (e: Endpoint, input: unknown) => Promise<ResOf<E>>)(e, { ...(input ?? {}), signal }),
  };
}
