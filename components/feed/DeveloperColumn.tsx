'use client';

import { useEffect, useState, useCallback } from 'react';
import { Link } from '@tanstack/react-router';
import { Loader2, KeyRound, Plus, Trash2, Copy, Check, Terminal, ShieldCheck, BookOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const BASE = 'https://rmhstudios.com';

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1/me',
    desc: 'Your account summary — profile, tier, and stats.',
    example: `curl ${BASE}/api/v1/me \\\n  -H "Authorization: Bearer rmh_live_..."`,
  },
  {
    method: 'GET',
    path: '/api/v1/posts?limit=20&cursor=<ISO>',
    desc: 'Your recent posts, newest first. Keyset-paginated via nextCursor.',
    example: `curl "${BASE}/api/v1/posts?limit=20" \\\n  -H "Authorization: Bearer rmh_live_..."`,
  },
  {
    method: 'POST',
    path: '/api/v1/posts',
    desc: 'Create a text post on your account. Body: { content, audience? }.',
    example: `curl -X POST ${BASE}/api/v1/posts \\\n  -H "Authorization: Bearer rmh_live_..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"content":"Posted via the API!"}'`,
  },
  {
    method: 'GET',
    path: '/api/v1/feed?limit=20&cursor=<ISO>',
    desc: 'The public global feed (public, free posts only).',
    example: `curl "${BASE}/api/v1/feed?limit=20" \\\n  -H "Authorization: Bearer rmh_live_..."`,
  },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-site-border bg-site-bg p-3 text-[12px] leading-relaxed text-site-text">
        <code>{code}</code>
      </pre>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute right-2 top-2 rounded-md p-1 text-site-text-dim hover:bg-site-surface hover:text-site-text"
        aria-label="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function DeveloperColumn() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/developer/keys', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys ?? []);
      setHasAccess(!!data.hasApiAccess);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await load();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewKey(data.key);
        setName('');
        await load();
      } else {
        alert(data.error || 'Could not create key');
      }
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this key? Apps using it will stop working immediately.')) return;
    const res = await fetch(`/api/developer/keys/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) setKeys((k) => k.filter((x) => x.id !== id));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Terminal className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">Developer API</h1>
      </header>

      <div className="space-y-8 p-4">
        {/* Intro */}
        <section>
          <p className="text-sm text-site-text-muted">
            Build on RMH Studios programmatically. The REST API is available to{' '}
            <strong className="text-site-text">Starter subscribers and above</strong>. Authenticate every request with
            an API key via the <code className="rounded bg-site-surface px-1">Authorization: Bearer</code> header.
          </p>
        </section>

        {/* Subscription gate / keys */}
        {!hasAccess ? (
          <section className="rounded-xl border border-site-border bg-site-surface p-5 text-center">
            <ShieldCheck className="mx-auto mb-2 h-7 w-7 text-site-accent" />
            <p className="font-semibold text-site-text">A subscription is required</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-site-text-muted">
              The developer API needs an active Starter plan or higher. Your access is checked on every request, so it
              stays in sync with your subscription.
            </p>
            <Link to="/pricing" className="mt-3 inline-block">
              <Button variant="accent" size="sm">View plans</Button>
            </Link>
          </section>
        ) : (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-site-accent" />
              <h2 className="text-sm font-bold text-site-text">Your API keys</h2>
            </div>

            {newKey && (
              <div className="mb-3 rounded-xl border border-site-accent/40 bg-site-accent/5 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold text-site-accent">Copy your key now — it won’t be shown again.</p>
                  <button onClick={() => setNewKey(null)} className="text-site-text-dim hover:text-site-text" aria-label="Dismiss">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-site-border bg-site-bg px-3 py-2 text-xs text-site-text">{newKey}</code>
                  <Button
                    size="sm"
                    variant="accent"
                    onClick={() => {
                      navigator.clipboard?.writeText(newKey).then(() => {
                        setCopiedKey(true);
                        setTimeout(() => setCopiedKey(false), 1500);
                      });
                    }}
                    className="gap-1"
                  >
                    {copiedKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="mb-3 flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Key name (e.g. “My bot”)"
                maxLength={100}
                className="flex-1 rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
              />
              <Button size="sm" variant="accent" disabled={creating || !name.trim()} onClick={create} className="gap-1">
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create
              </Button>
            </div>

            {keys.length === 0 ? (
              <p className="rounded-lg border border-dashed border-site-border py-6 text-center text-sm text-site-text-muted">
                No keys yet. Create one to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {keys.map((k) => (
                  <div key={k.id} className="flex items-center gap-3 rounded-xl border border-site-border bg-site-surface p-3">
                    <KeyRound className="h-4 w-4 shrink-0 text-site-text-dim" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-site-text">{k.name}</p>
                      <p className="font-mono text-[11px] text-site-text-dim">
                        {k.prefix}… · {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'never used'}
                      </p>
                    </div>
                    <button onClick={() => revoke(k.id)} className="text-site-text-dim hover:text-site-danger" aria-label="Revoke key">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Reference */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-site-accent" />
            <h2 className="text-sm font-bold text-site-text">API reference</h2>
          </div>

          <div className="space-y-2 rounded-xl border border-site-border bg-site-surface p-4 text-sm text-site-text-muted">
            <p><strong className="text-site-text">Base URL</strong> — <code className="rounded bg-site-bg px-1">{BASE}</code></p>
            <p><strong className="text-site-text">Auth</strong> — send <code className="rounded bg-site-bg px-1">Authorization: Bearer &lt;key&gt;</code> (or <code className="rounded bg-site-bg px-1">X-API-Key</code>) on every request.</p>
            <p><strong className="text-site-text">Rate limits</strong> — 120 req/min (Starter), 600 req/min (Pro+), per key. A <code className="rounded bg-site-bg px-1">429</code> includes <code className="rounded bg-site-bg px-1">Retry-After</code>.</p>
            <p><strong className="text-site-text">Errors</strong> — non-2xx responses are <code className="rounded bg-site-bg px-1">{'{ "error": { "code", "message" } }'}</code>.</p>
          </div>

          <div className="mt-3 space-y-3">
            {ENDPOINTS.map((e) => (
              <div key={`${e.method} ${e.path}`} className="rounded-xl border border-site-border bg-site-surface p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      e.method === 'GET' ? 'bg-sky-500/15 text-sky-400' : 'bg-emerald-500/15 text-emerald-400'
                    }`}
                  >
                    {e.method}
                  </span>
                  <code className="text-xs font-semibold text-site-text">{e.path}</code>
                </div>
                <p className="mt-1 text-xs text-site-text-muted">{e.desc}</p>
                <div className="mt-2">
                  <CodeBlock code={e.example} />
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-site-text-dim">
            Full reference, examples, and changelog: see{' '}
            <code className="rounded bg-site-surface px-1">docs/developer-api.md</code> in the repository.
          </p>
        </section>
      </div>
    </div>
  );
}
