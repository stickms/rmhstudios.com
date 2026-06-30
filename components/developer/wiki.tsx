'use client';

import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from '@tanstack/react-router';
import { Check, Copy } from 'lucide-react';
import { GUIDES } from '@/components/developer/guides';
import { SCOPES } from '@/lib/api/scopes';
import { ERROR_TYPES, DEFAULT_STATUS } from '@/lib/api/errors';
import { WEBHOOK_EVENTS } from '@/lib/webhooks/events';
import { endpointsByGroup, type ApiEndpoint } from '@/lib/api/registry';

/* ── shared bits ─────────────────────────────────────────────────────────── */

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative my-3">
      <pre className="overflow-x-auto rounded-site-sm border border-site-border bg-site-bg p-3 text-[12px] leading-relaxed text-site-text">
        <code data-lang={lang}>{code}</code>
      </pre>
      <button
        onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
        className="absolute right-2 top-2 rounded-site-sm p-1 text-site-text-dim hover:bg-site-surface hover:text-site-text"
        aria-label="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-site-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const color =
    method === 'GET' ? 'bg-site-accent/15 text-site-accent'
    : method === 'DELETE' ? 'bg-site-danger/15 text-site-danger'
    : method === 'PATCH' ? 'bg-amber-500/15 text-amber-500'
    : 'bg-site-success/15 text-site-success';
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${color}`}>{method}</span>;
}

const mdComponents = {
  h1: (p: { children?: ReactNode }) => <h1 className="mb-4 text-2xl font-black text-site-text" {...p} />,
  h2: (p: { children?: ReactNode }) => <h2 className="mt-8 mb-3 text-lg font-bold text-site-text" {...p} />,
  h3: (p: { children?: ReactNode }) => <h3 className="mt-5 mb-2 text-base font-bold text-site-text" {...p} />,
  p: (p: { children?: ReactNode }) => <p className="my-3 text-sm leading-relaxed text-site-text-muted" {...p} />,
  ul: (p: { children?: ReactNode }) => <ul className="my-3 list-disc space-y-1 pl-6 text-sm text-site-text-muted" {...p} />,
  ol: (p: { children?: ReactNode }) => <ol className="my-3 list-decimal space-y-1 pl-6 text-sm text-site-text-muted" {...p} />,
  li: (p: { children?: ReactNode }) => <li className="leading-relaxed" {...p} />,
  a: (p: { children?: ReactNode; href?: string }) => <a className="text-site-accent hover:underline" {...p} />,
  code: (p: { children?: ReactNode }) => <code className="rounded bg-site-surface px-1 py-0.5 text-[12px] text-site-text" {...p} />,
  pre: (p: { children?: ReactNode }) => <pre className="my-3 overflow-x-auto rounded-site-sm border border-site-border bg-site-bg p-3 text-[12px] leading-relaxed text-site-text" {...p} />,
  table: (p: { children?: ReactNode }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-sm" {...p} /></div>,
  th: (p: { children?: ReactNode }) => <th className="border border-site-border bg-site-surface px-3 py-1.5 text-left font-semibold text-site-text" {...p} />,
  td: (p: { children?: ReactNode }) => <td className="border border-site-border px-3 py-1.5 align-top text-site-text-muted" {...p} />,
  blockquote: (p: { children?: ReactNode }) => <blockquote className="my-3 border-l-4 border-site-accent pl-4 text-sm text-site-text-muted" {...p} />,
};

function Markdown({ children }: { children: string }) {
  return <ReactMarkdown components={mdComponents}>{children}</ReactMarkdown>;
}

/* ── dynamic tables ──────────────────────────────────────────────────────── */

function ScopesTable() {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead><tr><th className="border border-site-border bg-site-surface px-3 py-1.5 text-left font-semibold text-site-text">Scope</th><th className="border border-site-border bg-site-surface px-3 py-1.5 text-left font-semibold text-site-text">Grants</th></tr></thead>
        <tbody>
          {SCOPES.map((s) => (
            <tr key={s.id}>
              <td className="border border-site-border px-3 py-1.5"><code className="rounded bg-site-surface px-1 py-0.5 text-[12px] text-site-text">{s.id}</code></td>
              <td className="border border-site-border px-3 py-1.5 text-site-text-muted">{s.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorsTable() {
  const rows = Object.keys(ERROR_TYPES).sort();
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead><tr>
          <th className="border border-site-border bg-site-surface px-3 py-1.5 text-left font-semibold text-site-text">code</th>
          <th className="border border-site-border bg-site-surface px-3 py-1.5 text-left font-semibold text-site-text">type</th>
          <th className="border border-site-border bg-site-surface px-3 py-1.5 text-left font-semibold text-site-text">status</th>
        </tr></thead>
        <tbody>
          {rows.map((code) => (
            <tr key={code}>
              <td className="border border-site-border px-3 py-1.5"><code className="rounded bg-site-surface px-1 py-0.5 text-[12px] text-site-text">{code}</code></td>
              <td className="border border-site-border px-3 py-1.5 text-site-text-muted">{ERROR_TYPES[code]}</td>
              <td className="border border-site-border px-3 py-1.5 text-site-text-muted">{DEFAULT_STATUS[code]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventsTable() {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead><tr><th className="border border-site-border bg-site-surface px-3 py-1.5 text-left font-semibold text-site-text">Event</th><th className="border border-site-border bg-site-surface px-3 py-1.5 text-left font-semibold text-site-text">Fires when</th></tr></thead>
        <tbody>
          {WEBHOOK_EVENTS.map((e) => (
            <tr key={e.name}>
              <td className="border border-site-border px-3 py-1.5"><code className="rounded bg-site-surface px-1 py-0.5 text-[12px] text-site-text">{e.name}</code></td>
              <td className="border border-site-border px-3 py-1.5 text-site-text-muted">{e.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── endpoint reference ──────────────────────────────────────────────────── */

function EndpointCard({ ep }: { ep: ApiEndpoint }) {
  return (
    <div className="my-4 rounded-site border border-site-border bg-site-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <MethodBadge method={ep.method} />
        <code className="text-sm font-semibold text-site-text">{ep.path}</code>
        {ep.scope && <span className="rounded bg-site-bg px-1.5 py-0.5 text-[10px] text-site-text-dim">{ep.scope}</span>}
        {ep.idempotent && <span className="rounded bg-site-bg px-1.5 py-0.5 text-[10px] text-site-text-dim">idempotent</span>}
      </div>
      <p className="mt-2 text-sm text-site-text-muted">{ep.description}</p>

      {ep.params && ep.params.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-site-text">Parameters</p>
          <ul className="mt-1 space-y-1 text-xs text-site-text-muted">
            {ep.params.map((p) => (
              <li key={`${p.in}:${p.name}`}>
                <code className="rounded bg-site-bg px-1 text-site-text">{p.name}</code>{' '}
                <span className="text-site-text-dim">({p.in}{p.required ? ', required' : ''})</span> — {p.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ep.requestBody?.fields && ep.requestBody.fields.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-site-text">Body</p>
          <ul className="mt-1 space-y-1 text-xs text-site-text-muted">
            {ep.requestBody.fields.map((f) => (
              <li key={f.name}>
                <code className="rounded bg-site-bg px-1 text-site-text">{f.name}</code>{' '}
                <span className="text-site-text-dim">({f.type}{f.required ? ', required' : ''})</span> — {f.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ep.requestBody?.example !== undefined && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-site-text">Example request</p>
          <CodeBlock code={JSON.stringify(ep.requestBody.example, null, 2)} lang="json" />
        </div>
      )}

      {ep.responseExample !== undefined && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-site-text">Example response{ep.status ? ` (${ep.status})` : ''}</p>
          <CodeBlock code={JSON.stringify(ep.responseExample, null, 2)} lang="json" />
        </div>
      )}
    </div>
  );
}

function EndpointReference({ group }: { group: string }) {
  const bucket = endpointsByGroup().find((g) => g.group === group);
  if (!bucket) return <p className="text-sm text-site-text-muted">No endpoints.</p>;
  return (
    <>
      <h1 className="mb-2 text-2xl font-black text-site-text">{group}</h1>
      <p className="mb-4 text-sm text-site-text-muted">Endpoints in the {group} group. All paths are relative to <code className="rounded bg-site-surface px-1">https://rmhstudios.com</code>.</p>
      {bucket.endpoints.map((ep) => <EndpointCard key={`${ep.method} ${ep.path}`} ep={ep} />)}
    </>
  );
}

/* ── page registry + nav ─────────────────────────────────────────────────── */

interface WikiPageDef {
  slug: string;
  title: string;
  section: 'Guides' | 'Endpoints';
  render: () => ReactNode;
}

function guidePage(slug: string, title: string, extra?: () => ReactNode): WikiPageDef {
  return {
    slug,
    title,
    section: 'Guides',
    render: () => (<><Markdown>{GUIDES[slug] ?? ''}</Markdown>{extra?.()}</>),
  };
}

const GUIDE_PAGES: WikiPageDef[] = [
  guidePage('overview', 'Overview'),
  guidePage('authentication', 'Authentication'),
  { slug: 'scopes', title: 'Scopes', section: 'Guides', render: () => (<><h1 className="mb-3 text-2xl font-black text-site-text">Scopes</h1><p className="text-sm text-site-text-muted">Each API key carries granular scopes; an endpoint accepts a key only if its scopes satisfy the endpoint's requirement. The wildcards <code className="rounded bg-site-surface px-1">*</code>, <code className="rounded bg-site-surface px-1">read:*</code>, <code className="rounded bg-site-surface px-1">write:*</code> and <code className="rounded bg-site-surface px-1">manage:*</code> are also accepted. Grant the least privilege an integration needs.</p><ScopesTable /></>) },
  guidePage('rate-limits', 'Rate limits'),
  { slug: 'errors', title: 'Errors', section: 'Guides', render: () => (<><h1 className="mb-3 text-2xl font-black text-site-text">Errors</h1><p className="text-sm text-site-text-muted">Non-2xx responses use a stable envelope:</p><CodeBlock lang="json" code={JSON.stringify({ error: { type: 'authorization_error', code: 'insufficient_scope', message: 'This endpoint requires the "write:posts" scope, which this key does not have.', request_id: 'req_…' } }, null, 2)} /><p className="text-sm text-site-text-muted"><code className="rounded bg-site-surface px-1">code</code> is the precise reason; <code className="rounded bg-site-surface px-1">type</code> is the broad category; <code className="rounded bg-site-surface px-1">request_id</code> echoes the <code className="rounded bg-site-surface px-1">X-Request-Id</code> header for support.</p><ErrorsTable /></>) },
  guidePage('pagination', 'Pagination'),
  guidePage('idempotency', 'Idempotency'),
  guidePage('webhooks', 'Webhooks', () => <EventsTable />),
  guidePage('changelog', 'Changelog'),
];

const ENDPOINT_PAGES: WikiPageDef[] = endpointsByGroup().map((g) => ({
  slug: `endpoints-${g.group.toLowerCase()}`,
  title: g.group,
  section: 'Endpoints' as const,
  render: () => <EndpointReference group={g.group} />,
}));

export const WIKI_PAGES: WikiPageDef[] = [...GUIDE_PAGES, ...ENDPOINT_PAGES];

export const DEFAULT_WIKI_SLUG = 'overview';

export function findWikiPage(slug: string): WikiPageDef | undefined {
  return WIKI_PAGES.find((p) => p.slug === slug);
}

export function wikiSections(): { section: string; pages: WikiPageDef[] }[] {
  const sections: { section: string; pages: WikiPageDef[] }[] = [];
  for (const page of WIKI_PAGES) {
    let bucket = sections.find((s) => s.section === page.section);
    if (!bucket) { bucket = { section: page.section, pages: [] }; sections.push(bucket); }
    bucket.pages.push(page);
  }
  return sections;
}

/* ── exported renderers ──────────────────────────────────────────────────── */

export function WikiContent({ slug }: { slug: string }) {
  const page = findWikiPage(slug);
  if (!page) {
    return (
      <div className="py-10 text-center">
        <p className="font-semibold text-site-text">Page not found</p>
        <Link to="/developer/docs/$page" params={{ page: DEFAULT_WIKI_SLUG }} className="mt-2 inline-block text-sm text-site-accent hover:underline">Back to Overview</Link>
      </div>
    );
  }
  return <div className="min-w-0 max-w-3xl">{page.render()}</div>;
}

export function DocsSidebar({ activeSlug }: { activeSlug: string }) {
  return (
    <nav className="w-56 shrink-0 border-r border-site-border py-4 pr-3 text-sm">
      {wikiSections().map((section) => (
        <div key={section.section} className="mb-5">
          <p className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wide text-site-text-dim">{section.section}</p>
          <ul className="space-y-0.5">
            {section.pages.map((p) => (
              <li key={p.slug}>
                <Link
                  to="/developer/docs/$page"
                  params={{ page: p.slug }}
                  className={`block rounded-site-sm px-2 py-1 ${p.slug === activeSlug ? 'bg-site-accent/10 font-semibold text-site-accent' : 'text-site-text-muted hover:bg-site-surface hover:text-site-text'}`}
                >
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
