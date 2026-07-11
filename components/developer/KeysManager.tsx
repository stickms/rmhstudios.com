'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { KeyRound, Plus, Trash2, ShieldCheck, RefreshCw, X, BookOpen } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { SCOPES, DEFAULT_SCOPES, scopesByGroup } from '@/lib/api/scopes';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastFour: string | null;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const EXPIRY_OPTIONS = [
  { label: 'Never', days: 0 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
];

export function KeysManager() {
  const confirm = useConfirm();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([...DEFAULT_SCOPES]);
  const [expiryDays, setExpiryDays] = useState(0);
  const [newKey, setNewKey] = useState<string | null>(null);

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

  function toggleScope(id: string) {
    setScopes((cur) => (cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]));
  }

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scopes, expiresInDays: expiryDays || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewKey(data.key);
        setName('');
        await load();
      } else alert(data.error || 'Could not create key');
    } finally {
      setCreating(false);
    }
  }

  async function rotate(id: string) {
    const confirmed = await confirm({
      title: 'Rotate this key?',
      description: 'The current secret stops working immediately and a new one is issued.',
      confirmLabel: 'Rotate',
    });
    if (!confirmed) return;
    const res = await fetch(`/api/developer/keys/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotate: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.key) {
      setNewKey(data.key);
      await load();
    }
  }

  async function revoke(id: string) {
    const confirmed = await confirm({
      title: 'Revoke this key?',
      description: 'Apps using it will stop working immediately.',
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/api/developer/keys/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) setKeys((k) => k.filter((x) => x.id !== id));
  }

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );

  if (!hasAccess) {
    return (
      <section className="rounded-site border border-site-border bg-site-surface p-5 text-center">
        <ShieldCheck className="mx-auto mb-2 h-7 w-7 text-site-accent" />
        <p className="font-semibold text-site-text">A subscription is required</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-site-text-muted">
          The developer API needs an active Starter plan or higher. Your access is checked on every
          request, so it stays in sync with your subscription.
        </p>
        <Link to="/pricing" className="mt-3 inline-block">
          <Button variant="accent" size="sm">
            View plans
          </Button>
        </Link>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-site-accent" />
        <h2 className="text-sm font-bold text-site-text">Your API keys</h2>
      </div>

      {newKey && (
        <div className="mb-3 rounded-site border border-site-accent/40 bg-site-accent/5 p-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-semibold text-site-accent">
              Copy your key now — it won't be shown again.
            </p>
            <button
              onClick={() => setNewKey(null)}
              className="text-site-text-dim hover:text-site-text"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-xs text-site-text">
              {newKey}
            </code>
            <CopyButton value={newKey} variant="accent" size="icon-sm" label="Copy API key" />
          </div>
        </div>
      )}

      {/* Create form */}
      <div className="mb-4 space-y-3 rounded-site border border-site-border bg-site-surface p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='Key name (e.g. "My bot")'
          maxLength={100}
          className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
        />

        <div>
          <p className="mb-1 text-xs font-semibold text-site-text">Scopes</p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {scopesByGroup().map((g) => (
              <div key={g.group} className="mb-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-site-text-dim">
                  {g.group}
                </p>
                {g.scopes.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 py-0.5 text-xs text-site-text-muted"
                  >
                    <input
                      type="checkbox"
                      checked={scopes.includes(s.id)}
                      onChange={() => toggleScope(s.id)}
                      className="accent-site-accent"
                    />
                    <code className="text-site-text">{s.id}</code>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-2 text-[11px]">
            <button
              onClick={() => setScopes(SCOPES.map((s) => s.id))}
              className="text-site-accent hover:underline"
            >
              Select all
            </button>
            <button
              onClick={() => setScopes([...DEFAULT_SCOPES])}
              className="text-site-accent hover:underline"
            >
              Read-only
            </button>
            <button onClick={() => setScopes([])} className="text-site-accent hover:underline">
              Clear
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-site-text-muted">Expires</label>
          <select
            value={expiryDays}
            onChange={(e) => setExpiryDays(Number(e.target.value))}
            className="rounded-site-sm border border-site-border bg-site-bg px-2 py-1 text-xs text-site-text"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="accent"
            disabled={creating || !name.trim()}
            onClick={create}
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Create key
          </Button>
        </div>
      </div>

      {keys.length === 0 ? (
        <p className="rounded-site-sm border border-dashed border-site-border py-6 text-center text-sm text-site-text-muted">
          No keys yet. Create one to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => {
            const expired = k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();
            return (
              <div
                key={k.id}
                className="rounded-site border border-site-border bg-site-surface p-3"
              >
                <div className="flex items-center gap-3">
                  <KeyRound className="h-4 w-4 shrink-0 text-site-text-dim" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-site-text">{k.name}</p>
                    <p className="font-mono text-[11px] text-site-text-dim">
                      {k.prefix}…{k.lastFour ?? ''} ·{' '}
                      {k.lastUsedAt
                        ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                        : 'never used'}
                      {k.expiresAt && (
                        <span className={expired ? 'text-site-danger' : ''}>
                          {' '}
                          ·{' '}
                          {expired
                            ? 'expired'
                            : `expires ${new Date(k.expiresAt).toLocaleDateString()}`}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => rotate(k.id)}
                    className="text-site-text-dim hover:text-site-accent"
                    aria-label="Rotate key"
                    title="Rotate"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => revoke(k.id)}
                    className="text-site-text-dim hover:text-site-danger"
                    aria-label="Revoke key"
                    title="Revoke"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {k.scopes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <span
                        key={s}
                        className="rounded bg-site-bg px-1.5 py-0.5 text-[10px] text-site-text-dim"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 flex items-center gap-1 text-xs text-site-text-dim">
        <BookOpen className="h-3.5 w-3.5" />
        New here? Read the{' '}
        <Link
          to="/developer/docs/$page"
          params={{ page: 'overview' }}
          className="text-site-accent hover:underline"
        >
          API documentation
        </Link>
        .
      </p>
    </section>
  );
}
