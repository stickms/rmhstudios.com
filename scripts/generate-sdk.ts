/**
 * Generates the typed TypeScript client in `packages/sdk/` from the OpenAPI
 * document (`lib/api/openapi.ts`), so the SDK is versioned with the API and can
 * never drift from it.
 *
 *     pnpm sdk:generate          # rewrite
 *     pnpm sdk:generate --check  # fail if the committed output is stale (CI)
 *
 * No publish step: the package is private and consumed by copy / git for now.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from '../lib/api/openapi';
import { API_VERSION, API_BASE_URL } from '../lib/api/registry';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packages', 'sdk');
const CHECK = process.argv.includes('--check');

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const key = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));

/** Structural TS type of an example value. */
function tsOf(v: unknown, k = ''): string {
  if (v === null) return k === 'nextCursor' ? 'string | null' : 'unknown';
  if (Array.isArray(v)) return v.length ? `${tsOf(v[0])}[]` : 'unknown[]';
  if (typeof v === 'object') {
    const entries = Object.entries(v as Json).map(([k, x]) => `${key(k)}: ${tsOf(x, k)}`);
    return entries.length ? `{ ${entries.join('; ')} }` : 'Record<string, unknown>';
  }
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    ? typeof v
    : 'unknown';
}

function propType(p: Json): string {
  if (p.type === 'array') return 'string[]';
  if (p.type === 'integer' || p.type === 'number') return 'number';
  if (p.type === 'boolean') return 'boolean';
  if (p.type === 'object') return 'Record<string, unknown>';
  return 'string';
}

function generate(): string {
  const doc = buildOpenApiDocument() as Json;
  const types: string[] = [];
  const methods: string[] = [];

  for (const [path, ops] of Object.entries<Json>(doc.paths)) {
    for (const [method, op] of Object.entries<Json>(ops)) {
      const id: string = op.operationId;
      const T = pascal(id);
      const params: Json[] = (op.parameters ?? []).filter((p: Json) => p.in !== 'header');
      const fields = params.map(
        (p) =>
          `  /** ${String(p.description).replace(/\*\//g, '')} */\n  ${key(p.name)}${p.required ? '' : '?'}: ${propType(p.schema)};`,
      );

      const bodyContent = op.requestBody?.content ?? {};
      const bodyType = Object.keys(bodyContent)[0];
      let bodyField = '';
      if (bodyType?.startsWith('multipart')) {
        bodyField = '  body: FormData;';
      } else if (bodyType) {
        const props = Object.entries<Json>(bodyContent[bodyType].schema.properties ?? {}).map(
          ([k, p]) =>
            `  /** ${String(p.description).replace(/\*\//g, '')} */\n  ${key(k)}?: ${propType(p)};`,
        );
        types.push(`export interface ${T}Body {\n${props.join('\n')}\n}`);
        bodyField = `  body: ${T}Body;`;
      }
      if (op.parameters?.some((p: Json) => p.in === 'header')) {
        fields.push(
          '  /** Retried requests with the same key are applied once. */\n  idempotencyKey?: string;',
        );
      }
      const hasArgs = fields.length > 0 || bodyField;
      if (hasArgs)
        types.push(
          `export interface ${T}Args {\n${[...fields, bodyField].filter(Boolean).join('\n')}\n}`,
        );

      const success = Object.keys(op.responses).find((c) => c.startsWith('2'))!;
      const example = op.responses[success].content?.['application/json']?.example;
      const resType =
        success === '204' ? 'void' : example === undefined ? 'unknown' : `${T}Response`;
      if (resType === `${T}Response`) types.push(`export type ${T}Response = ${tsOf(example)};`);

      const pathParams = params.filter((p) => p.in === 'path').map((p) => p.name);
      const queryParams = params.filter((p) => p.in === 'query').map((p) => p.name);
      const hasBody = Boolean(bodyType);
      const allOptional = !hasBody && params.every((p) => !p.required);
      const opts = [
        `path: ${JSON.stringify(path)}`,
        pathParams.length
          ? `pathParams: { ${pathParams.map((n) => `${key(n)}: args.${n}`).join(', ')} }`
          : '',
        queryParams.length
          ? `query: { ${queryParams.map((n) => `${key(n)}: args.${n}`).join(', ')} }`
          : '',
        hasBody ? 'body: args.body' : '',
        fields.some((f) => f.includes('idempotencyKey'))
          ? 'idempotencyKey: args.idempotencyKey'
          : '',
        bodyType?.startsWith('multipart') ? 'multipart: true' : '',
      ].filter(Boolean);
      methods.push(
        `  /** ${String(op.summary).replace(/\*\//g, '')} (scope: ${op['x-required-scope'] ?? 'none'}) */\n` +
          `  ${id}(${hasArgs ? `args: ${T}Args${allOptional ? ' = {}' : ''}` : ''}): Promise<${resType}> {\n` +
          `    return this.request<${resType}>(${JSON.stringify(method.toUpperCase())}, { ${opts.join(', ')} });\n  }`,
      );
    }
  }

  return `/* eslint-disable */
// GENERATED by scripts/generate-sdk.ts from lib/api/openapi.ts — do not edit.
// Run \`pnpm sdk:generate\`. API version: ${API_VERSION}.

export const API_VERSION = ${JSON.stringify(API_VERSION)};

export class RmhApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'RmhApiError';
  }
}

export interface RmhClientOptions {
  /** \`rmh_live_…\` for real data, \`rmh_test_…\` for the sandbox. */
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

interface RequestOptions {
  path: string;
  pathParams?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  idempotencyKey?: string;
  multipart?: boolean;
}

${types.join('\n\n')}

export class RmhClient {
  private apiKey: string;
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(opts: RmhClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? ${JSON.stringify(API_BASE_URL)}).replace(/\\/$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private async request<T>(method: string, o: RequestOptions): Promise<T> {
    let path = o.path;
    for (const [k, v] of Object.entries(o.pathParams ?? {})) path = path.replace(\`{\${k}}\`, encodeURIComponent(v));
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { Authorization: \`Bearer \${this.apiKey}\` };
    if (o.idempotencyKey) headers['Idempotency-Key'] = o.idempotencyKey;
    let body: BodyInit | undefined;
    if (o.body !== undefined) {
      if (o.multipart) body = o.body as FormData;
      else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(o.body);
      }
    }
    const res = await this.fetchImpl(url, { method, headers, body });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const e = data?.error ?? {};
      throw new RmhApiError(res.status, e.code ?? 'unknown', e.message ?? res.statusText, e.request_id);
    }
    return data as T;
  }

${methods.join('\n\n')}
}
`;
}

const files: Record<string, string> = {
  'src/index.ts': generate(),
  'package.json':
    JSON.stringify(
      {
        name: '@rmhstudios/sdk',
        version: `${API_VERSION.replace(/^v/, '')}.0.0`,
        private: true,
        description: 'Typed client for the RMH Studios REST API (generated).',
        type: 'module',
        main: 'src/index.ts',
        types: 'src/index.ts',
      },
      null,
      2,
    ) + '\n',
};

const stale: string[] = [];
for (const [rel, content] of Object.entries(files)) {
  const file = join(OUT, rel);
  if (CHECK) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== content)
      stale.push(`packages/sdk/${rel}`);
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}
if (CHECK && stale.length) {
  console.error(`SDK is stale (run \`pnpm sdk:generate\`):\n  ${stale.join('\n  ')}`);
  process.exit(1);
}
process.stdout.write(
  (CHECK ? 'SDK is up to date.' : `Wrote ${Object.keys(files).length} files to packages/sdk/.`) +
    '\n',
);
