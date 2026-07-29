/**
 * Generates the developer-API reference pages under `docs/developer-api/` from
 * the same pure catalogs the API itself uses.
 *
 *   lib/api/registry.ts   → docs/developer-api/endpoints/*.md   (fully generated)
 *   lib/api/scopes.ts     → the scope table in scopes.md
 *   lib/api/errors.ts     → the error table in errors.md
 *   lib/webhooks/events.ts→ the event table in webhooks.md
 *
 * The endpoint pages are written whole. The three tables are spliced into
 * hand-written guides between `<!-- BEGIN GENERATED: x -->` markers, so prose
 * and generated content can live on the same page without fighting.
 *
 * Run after changing any of those catalogs:
 *
 *     pnpm docs:api          # rewrite
 *     pnpm docs:api --check  # fail if the tree is stale (CI)
 */

import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENDPOINTS, endpointsByGroup, API_BASE_URL, type ApiEndpoint } from '../lib/api/registry';
import { SCOPES } from '../lib/api/scopes';
import { ERROR_TYPES, DEFAULT_STATUS } from '../lib/api/errors';
import { WEBHOOK_EVENTS } from '../lib/webhooks/events';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs', 'developer-api');
const ENDPOINTS_DIR = join(DOCS, 'endpoints');

const CHECK = process.argv.includes('--check');
const stale: string[] = [];

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** Escape a value for use inside a Markdown table cell. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function fence(code: string, lang = ''): string {
  return '```' + lang + '\n' + code + '\n```';
}

function slugify(group: string): string {
  return group.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Write a file, or record it as stale under --check. */
function emit(path: string, content: string): void {
  const previous = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (previous === content) return;
  if (CHECK) {
    stale.push(path.slice(ROOT.length + 1));
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Replace the region between the BEGIN/END markers for `id` in `path`. */
function splice(path: string, id: string, body: string): void {
  const source = readFileSync(path, 'utf8');
  const begin = `<!-- BEGIN GENERATED: ${id} -->`;
  const end = `<!-- END GENERATED: ${id} -->`;
  const from = source.indexOf(begin);
  const to = source.indexOf(end);
  if (from === -1 || to === -1) {
    throw new Error(`${path}: missing "${id}" generated markers — add them back or the table can't be refreshed.`);
  }
  const next = source.slice(0, from + begin.length) + '\n\n' + body + '\n\n' + source.slice(to);
  emit(path, next);
}

const GENERATED_HEADER = [
  '<!--',
  '  GENERATED FILE — do not edit by hand.',
  '  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.',
  '-->',
  '',
].join('\n');

/* ── endpoint rendering ──────────────────────────────────────────────────── */

function renderEndpoint(ep: ApiEndpoint): string {
  const out: string[] = [];

  out.push(`### \`${ep.method} ${ep.path}\``);
  out.push('');
  out.push(ep.description);
  out.push('');

  const facts: string[] = [];
  facts.push(`**Scope:** ${ep.scope ? `\`${ep.scope}\`` : 'none — this endpoint is unauthenticated'}`);
  facts.push(`**Success:** \`${ep.status ?? 200}\``);
  if (ep.idempotent) facts.push('**Idempotent:** accepts `Idempotency-Key`');
  if (ep.paginated) facts.push('**Paginated:** keyset — see [Pagination](../pagination.md)');
  facts.push(`**Operation id:** \`${ep.operationId}\``);
  out.push(facts.join(' · '));
  out.push('');

  if (ep.params?.length) {
    out.push('| Parameter | In | Type | Required | Description |');
    out.push('| --------- | -- | ---- | -------- | ----------- |');
    for (const p of ep.params) {
      out.push(
        `| \`${p.name}\` | ${p.in} | ${p.type} | ${p.required ? 'yes' : 'no'} | ${cell(p.description)} |`,
      );
    }
    out.push('');
  }

  if (ep.requestBody) {
    const contentType = ep.requestBody.contentType ?? 'application/json';
    out.push(`**Request body** (\`${contentType}\`)`);
    out.push('');
    if (ep.requestBody.fields?.length) {
      out.push('| Field | Type | Required | Description |');
      out.push('| ----- | ---- | -------- | ----------- |');
      for (const f of ep.requestBody.fields) {
        out.push(`| \`${f.name}\` | \`${f.type}\` | ${f.required ? 'yes' : 'no'} | ${cell(f.description)} |`);
      }
      out.push('');
    }
    if (ep.requestBody.example !== undefined) {
      out.push(fence(JSON.stringify(ep.requestBody.example, null, 2), 'json'));
      out.push('');
    }
  }

  if (ep.responseExample !== undefined) {
    out.push(`**Example response** (\`${ep.status ?? 200}\`)`);
    out.push('');
    out.push(fence(JSON.stringify(ep.responseExample, null, 2), 'json'));
    out.push('');
  }

  return out.join('\n');
}

function renderGroupPage(group: string, endpoints: ApiEndpoint[]): string {
  const out: string[] = [GENERATED_HEADER];
  out.push(`# ${group}`);
  out.push('');
  out.push(
    `${endpoints.length} endpoint${endpoints.length === 1 ? '' : 's'}. Paths are relative to \`${API_BASE_URL}\`.`,
  );
  out.push('');

  out.push('| Endpoint | Scope | Summary |');
  out.push('| -------- | ----- | ------- |');
  for (const ep of endpoints) {
    out.push(`| \`${ep.method} ${ep.path}\` | ${ep.scope ? `\`${ep.scope}\`` : '—'} | ${cell(ep.summary)} |`);
  }
  out.push('');

  out.push('## Reference');
  out.push('');
  for (const ep of endpoints) out.push(renderEndpoint(ep));

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function renderEndpointsIndex(groups: { group: string; endpoints: ApiEndpoint[] }[]): string {
  const out: string[] = [GENERATED_HEADER];
  out.push('# Endpoint reference');
  out.push('');
  out.push(
    `Every endpoint in the public \`v1\` API — ${ENDPOINTS.length} across ${groups.length} groups. ` +
      `Paths are relative to \`${API_BASE_URL}\`. The same registry generates the ` +
      '[OpenAPI 3.1 document](https://rmhstudios.com/api/v1/openapi.json), so the two never disagree.',
  );
  out.push('');
  out.push('| Group | Endpoints | Covers |');
  out.push('| ----- | --------- | ------ |');
  for (const g of groups) {
    const scopes = [...new Set(g.endpoints.map((e) => e.scope).filter(Boolean))] as string[];
    out.push(
      `| [${g.group}](./${slugify(g.group)}.md) | ${g.endpoints.length} | ${
        scopes.length ? scopes.map((s) => `\`${s}\``).join(', ') : 'no scope required'
      } |`,
    );
  }
  out.push('');
  out.push('```{toctree}');
  out.push(':maxdepth: 2');
  out.push(':hidden:');
  out.push('');
  for (const g of groups) out.push(slugify(g.group));
  out.push('```');
  out.push('');
  return out.join('\n');
}

/* ── table rendering ─────────────────────────────────────────────────────── */

function renderScopesTable(): string {
  const out: string[] = ['| Scope | Group | Grants |', '| ----- | ----- | ------ |'];
  for (const s of SCOPES) out.push(`| \`${s.id}\` | ${s.group} | ${cell(s.description)} |`);
  return out.join('\n');
}

function renderErrorsTable(): string {
  const out: string[] = ['| `code` | `type` | HTTP status |', '| ------ | ------ | ----------- |'];
  for (const code of Object.keys(ERROR_TYPES).sort()) {
    out.push(`| \`${code}\` | \`${ERROR_TYPES[code]}\` | \`${DEFAULT_STATUS[code]}\` |`);
  }
  return out.join('\n');
}

function renderEventsTable(): string {
  const out: string[] = ['| Event | Fires when |', '| ----- | ---------- |'];
  for (const e of WEBHOOK_EVENTS) out.push(`| \`${e.name}\` | ${cell(e.description)} |`);
  return out.join('\n');
}

/* ── main ────────────────────────────────────────────────────────────────── */

const groups = endpointsByGroup();

// Drop endpoint pages for groups that no longer exist, so a renamed group
// doesn't leave an orphan page in the toctree.
if (!CHECK && existsSync(ENDPOINTS_DIR)) {
  const keep = new Set([...groups.map((g) => `${slugify(g.group)}.md`), 'index.md']);
  for (const name of readdirSync(ENDPOINTS_DIR)) {
    if (name.endsWith('.md') && !keep.has(name)) rmSync(join(ENDPOINTS_DIR, name));
  }
}

emit(join(ENDPOINTS_DIR, 'index.md'), renderEndpointsIndex(groups));
for (const g of groups) {
  emit(join(ENDPOINTS_DIR, `${slugify(g.group)}.md`), renderGroupPage(g.group, g.endpoints));
}

splice(join(DOCS, 'scopes.md'), 'scopes', renderScopesTable());
splice(join(DOCS, 'errors.md'), 'errors', renderErrorsTable());
splice(join(DOCS, 'webhooks.md'), 'events', renderEventsTable());

if (CHECK && stale.length) {
  console.error('Developer API docs are out of date. Run `pnpm docs:api` and commit:');
  for (const f of stale) console.error(`  ${f}`);
  process.exit(1);
}

// `no-console` allows only warn/error; this is ordinary CLI output, not a fault.
process.stdout.write(
  (CHECK
    ? 'Developer API docs are up to date.'
    : `Wrote ${groups.length} endpoint pages (${ENDPOINTS.length} endpoints), ${SCOPES.length} scopes, ${Object.keys(ERROR_TYPES).length} error codes, ${WEBHOOK_EVENTS.length} webhook events.`) + '\n',
);
