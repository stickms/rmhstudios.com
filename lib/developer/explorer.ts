/**
 * Pure logic behind the API explorer (`/developer/explorer`): turn a registry endpoint plus the member's inputs into a
 * same-origin request, render that request as copy-paste snippets, and report JSON mistakes with a position.
 *
 * Nothing here touches the network, storage or the DOM, and there are no strings for the member to read: the
 * components translate. The one safety rule lives in `buildRequest`: a request only ever targets `/api/v1/**`.
 */
import { API_BASE_URL, type ApiEndpoint, type ApiParam } from '@/lib/api/registry';
import { isTestKey as isTestKeyPrefix } from '@/lib/api/test-mode';

export const API_PATH_PREFIX = '/api/v1/';

/** The environment variable the snippets read the key from. */
export const KEY_ENV_NAME = 'RMH_API_KEY';

/** Groups that have a page in the external docs (`docs/developer-api/endpoints/<group>.md`). */
const DOCUMENTED_GROUPS: ReadonlySet<string> = new Set([
  'account',
  'communities',
  'content',
  'engagement',
  'events',
  'feed',
  'games',
  'media',
  'meta',
  'posts',
  'reading',
  'study',
  'users',
  'webhooks',
]);

/** Docs page path for an endpoint's group (pass to `docsUrl`), or null when the docs have no page for it. */
export function docsPathForGroup(group: string): string | null {
  const slug = group.toLowerCase();
  return DOCUMENTED_GROUPS.has(slug) ? `developer-api/endpoints/${slug}` : null;
}

export type RequestErrorCode = 'path-not-allowed' | 'missing-path-param';

export class ExplorerRequestError extends Error {
  readonly code: RequestErrorCode;
  readonly detail: string;
  constructor(code: RequestErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'ExplorerRequestError';
    this.code = code;
    this.detail = detail;
  }
}

/** What the member typed. Boolean parameters are `'true'` when switched on and `''` otherwise. */
export interface ExplorerValues {
  params: Readonly<Record<string, string>>;
  /** The JSON body text, for endpoints that take one. */
  body?: string;
  key?: string;
}

export interface ExplorerRequest {
  /** Same-origin, starts with `/api/v1/`. */
  url: string;
  method: ApiEndpoint['method'];
  headers: Record<string, string>;
  body: string | null;
}

export function isTestKey(key: string): boolean {
  return isTestKeyPrefix(key.trim());
}

export function hasRequestBody(endpoint: ApiEndpoint): boolean {
  return endpoint.requestBody !== undefined;
}

/** `encodeURIComponent`, plus the dots it leaves alone, so a value of `..` cannot walk out of its segment. */
function encodeSegment(value: string): string {
  return encodeURIComponent(value).replace(/\./g, '%2E');
}

function paramsIn(endpoint: ApiEndpoint, where: ApiParam['in']): ApiParam[] {
  return (endpoint.params ?? []).filter((p) => p.in === where);
}

/** Names of required path and query parameters with no value, in registry order. */
export function missingRequired(endpoint: ApiEndpoint, params: Readonly<Record<string, string>>): string[] {
  return (endpoint.params ?? [])
    .filter((p) => (p.required || p.in === 'path') && !(params[p.name] ?? '').trim())
    .map((p) => p.name);
}

/**
 * The request the explorer sends. Path parameters are percent-encoded, query parameters with an empty value are
 * dropped, and a registry path outside `/api/v1/` is refused: the explorer is same-origin to the public API only.
 */
export function buildRequest(endpoint: ApiEndpoint, values: ExplorerValues): ExplorerRequest {
  if (!endpoint.path.startsWith(API_PATH_PREFIX)) {
    throw new ExplorerRequestError('path-not-allowed', endpoint.path);
  }
  let path = endpoint.path;
  for (const p of paramsIn(endpoint, 'path')) {
    const value = (values.params[p.name] ?? '').trim();
    if (!value) throw new ExplorerRequestError('missing-path-param', p.name);
    path = path.split(`{${p.name}}`).join(encodeSegment(value));
  }
  const query = new URLSearchParams();
  for (const p of paramsIn(endpoint, 'query')) {
    const value = (values.params[p.name] ?? '').trim();
    if (value) query.append(p.name, value);
  }
  const qs = query.toString();
  const headers: Record<string, string> = { Accept: 'application/json' };
  const key = (values.key ?? '').trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  const bodyText = hasRequestBody(endpoint) ? (values.body ?? '').trim() : '';
  if (bodyText) headers['Content-Type'] = 'application/json';
  return {
    url: qs ? `${path}?${qs}` : path,
    method: endpoint.method,
    headers,
    body: bodyText || null,
  };
}

/** The example body the editor starts with, pretty-printed; empty when the endpoint takes none. */
export function exampleBody(endpoint: ApiEndpoint): string {
  const example = endpoint.requestBody?.example;
  return example === undefined ? '' : JSON.stringify(example, null, 2);
}

export interface SnippetOptions {
  /** Put the real key in the snippet. Off by default: the snippet reads it from the environment. */
  includeKey?: boolean;
  /** Origin the snippet calls. Defaults to the production site. */
  origin?: string;
}

function snippetUrl(request: ExplorerRequest, origin: string | undefined): string {
  return `${(origin ?? API_BASE_URL).replace(/\/+$/, '')}${request.url}`;
}

function keyOf(request: ExplorerRequest): string | null {
  const auth = request.headers.Authorization;
  return auth ? auth.replace(/^Bearer /, '') : null;
}

/** Wrap in single quotes for a POSIX shell; an embedded single quote closes, escapes and reopens the quotes. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function toCurl(request: ExplorerRequest, opts: SnippetOptions = {}): string {
  const lines = [`curl -X ${request.method} ${shellQuote(snippetUrl(request, opts.origin))}`];
  for (const [name, value] of Object.entries(request.headers)) {
    if (name === 'Authorization') {
      const key = keyOf(request);
      if (key === null) continue;
      lines.push(
        opts.includeKey
          ? `-H ${shellQuote(`Authorization: Bearer ${key}`)}`
          : `-H "Authorization: Bearer $${KEY_ENV_NAME}"`,
      );
    } else {
      lines.push(`-H ${shellQuote(`${name}: ${value}`)}`);
    }
  }
  if (request.body !== null) lines.push(`--data ${shellQuote(request.body)}`);
  return lines.join(' \\\n  ');
}

export function toFetch(request: ExplorerRequest, opts: SnippetOptions = {}): string {
  const headers = Object.entries(request.headers).flatMap(([name, value]) => {
    if (name !== 'Authorization') return [`    ${JSON.stringify(name)}: ${JSON.stringify(value)},`];
    const key = keyOf(request);
    if (key === null) return [];
    return [
      opts.includeKey
        ? `    "Authorization": ${JSON.stringify(`Bearer ${key}`)},`
        : `    "Authorization": \`Bearer \${process.env.${KEY_ENV_NAME}}\`,`,
    ];
  });
  const lines = [
    `const response = await fetch(${JSON.stringify(snippetUrl(request, opts.origin))}, {`,
    `  method: ${JSON.stringify(request.method)},`,
    '  headers: {',
    ...headers,
    '  },',
  ];
  if (request.body !== null) lines.push(`  body: ${JSON.stringify(request.body)},`);
  lines.push('});', 'console.log(response.status, await response.json());');
  return lines.join('\n');
}

export function toPython(request: ExplorerRequest, opts: SnippetOptions = {}): string {
  const headers = Object.entries(request.headers).flatMap(([name, value]) => {
    if (name !== 'Authorization') return [`        ${JSON.stringify(name)}: ${JSON.stringify(value)},`];
    const key = keyOf(request);
    if (key === null) return [];
    return [
      opts.includeKey
        ? `        "Authorization": ${JSON.stringify(`Bearer ${key}`)},`
        : `        "Authorization": "Bearer " + os.environ["${KEY_ENV_NAME}"],`,
    ];
  });
  const needsOs = !opts.includeKey && keyOf(request) !== null;
  const lines = [...(needsOs ? ['import os', ''] : []), 'import requests', '', 'response = requests.request('];
  lines.push(
    `    ${JSON.stringify(request.method)},`,
    `    ${JSON.stringify(snippetUrl(request, opts.origin))},`,
    '    headers={',
    ...headers,
    '    },',
  );
  if (request.body !== null) lines.push(`    data=${JSON.stringify(request.body)},`);
  lines.push(')', 'print(response.status_code, response.json())');
  return lines.join('\n');
}

export type JsonParse =
  | { ok: true; value: unknown }
  | { ok: false; line: number; column: number; message: string };

/** Line and column (both 1-based) of a character offset. */
function lineColumn(text: string, position: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, Math.min(position, text.length)));
  const lines = before.split('\n');
  return { line: lines.length, column: (lines[lines.length - 1] ?? '').length + 1 };
}

/**
 * Offset of the first character that makes `text` invalid JSON (the text length when it ends too early), or -1 when
 * it is valid. A small recursive-descent scan, because engines word their errors differently and not all say where.
 */
function jsonErrorOffset(text: string): number {
  let i = 0;
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++;
  };
  const literal = (word: string): boolean => {
    for (const ch of word) {
      if (text[i] !== ch) return false;
      i++;
    }
    return true;
  };
  const string = (): boolean => {
    i++;
    while (i < text.length) {
      const ch = text[i]!;
      if (ch === '"') {
        i++;
        return true;
      }
      if (ch < ' ') return false;
      if (ch === '\\') {
        i++;
        const esc = text[i];
        if (esc === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) return false;
          i += 4;
        } else if (esc === undefined || !'"\\/bfnrt'.includes(esc)) {
          return false;
        }
      }
      i++;
    }
    return false;
  };
  const close = (): boolean => {
    i++;
    return true;
  };
  const number = (): boolean => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) return false;
    i += m[0].length;
    return true;
  };
  const value = (): boolean => {
    ws();
    const ch = text[i];
    if (ch === '{') {
      i++;
      ws();
      if (text[i] === '}') return close();
      for (;;) {
        ws();
        if (text[i] !== '"' || !string()) return false;
        ws();
        if (text[i] !== ':') return false;
        i++;
        if (!value()) return false;
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        return text[i] === '}' ? close() : false;
      }
    }
    if (ch === '[') {
      i++;
      ws();
      if (text[i] === ']') return close();
      for (;;) {
        if (!value()) return false;
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        return text[i] === ']' ? close() : false;
      }
    }
    if (ch === '"') return string();
    if (ch === 't') return literal('true');
    if (ch === 'f') return literal('false');
    if (ch === 'n') return literal('null');
    return number();
  };
  if (!value()) return i;
  ws();
  return i < text.length ? i : -1;
}

/** `JSON.parse` that says where it failed (1-based line and column). */
export function parseJsonWithPosition(text: string): JsonParse {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const offset = jsonErrorOffset(text);
    return { ok: false, ...lineColumn(text, offset < 0 ? text.length : offset), message };
  }
}

export interface EndpointGroup {
  group: string;
  endpoints: ApiEndpoint[];
}

/** Keep the endpoints whose method, path, summary or scope contains every word of `query`; empty groups drop out. */
export function filterGroups(groups: readonly EndpointGroup[], query: string): EndpointGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...groups];
  const out: EndpointGroup[] = [];
  for (const g of groups) {
    const endpoints = g.endpoints.filter((ep) => {
      const hay = `${ep.method} ${ep.path} ${ep.summary} ${ep.scope ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    if (endpoints.length > 0) out.push({ group: g.group, endpoints });
  }
  return out;
}
