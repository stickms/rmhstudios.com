'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  KeyRound,
  Plus,
  Trash2,
  ShieldCheck,
  RefreshCw,
  X,
  BookOpen,
  Activity,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CopyButton } from '@/components/ui/copy-button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { SCOPES, DEFAULT_SCOPES, scopesByGroup } from '@/lib/api/scopes';
import { DEVELOPER_DOCS_URL } from '@/lib/docs-site';
import { KeyUsage } from '@/components/developer/KeyUsage';
import { TestKeyCreator } from '@/components/developer/TestKeyCreator';

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
  { key: 'keys-expiry-never', label: 'Never', days: 0 },
  { key: 'keys-expiry-30', label: '30 days', days: 30 },
  { key: 'keys-expiry-90', label: '90 days', days: 90 },
  { key: 'keys-expiry-365', label: '1 year', days: 365 },
];

export function KeysManager() {
  const { t } = useTranslation('f-devplatform');
  const confirm = useConfirm();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([...DEFAULT_SCOPES]);
  /** Which key's usage panel is expanded, if any. */
  const [usageFor, setUsageFor] = useState<string | null>(null);
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
      } else
        toast.error(
          data.error || t('keys-create-failed', { defaultValue: 'Could not create key' }),
        );
    } finally {
      setCreating(false);
    }
  }

  async function rotate(id: string) {
    const confirmed = await confirm({
      title: t('keys-rotate-title', { defaultValue: 'Rotate this key?' }),
      description: t('keys-rotate-body', {
        defaultValue: 'The current secret stops working immediately and a new one is issued.',
      }),
      confirmLabel: t('keys-rotate-confirm', { defaultValue: 'Rotate' }),
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
      title: t('keys-revoke-title', { defaultValue: 'Revoke this key?' }),
      description: t('keys-revoke-body', {
        defaultValue: 'Apps using it will stop working immediately.',
      }),
      confirmLabel: t('keys-revoke-confirm', { defaultValue: 'Revoke' }),
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
      <section className="glass-pane rounded-site px-4 py-6 text-center">
        <ShieldCheck className="mx-auto mb-2 size-7 text-site-accent" aria-hidden />
        <p className="font-semibold text-site-text">
          {t('keys-subscription-title', { defaultValue: 'A subscription is required' })}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-site-text-muted">
          {t('keys-subscription-body', {
            defaultValue:
              'The developer API needs an active HARD-R plan or higher. Your access is checked on every request, so it stays in sync with your subscription.',
          })}
        </p>
        <Button asChild variant="accent" size="sm" className="mt-3">
          <Link to="/store" search={{ tab: 'membership' }}>
            {t('keys-view-plans', { defaultValue: 'View plans' })}
          </Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="site-section-label flex items-center gap-2">
        <KeyRound className="size-4 text-site-accent" aria-hidden />
        {t('keys-title', { defaultValue: 'Your API keys' })}
      </h2>

      {newKey && (
        <div className="space-y-2 rounded-site border border-site-accent/40 bg-site-accent/5 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-site-accent">
              {t('keys-copy-now', { defaultValue: "Copy your key now — it won't be shown again." })}
            </p>
            <IconButton
              icon={X}
              size="icon-xs"
              label={t('keys-dismiss', { defaultValue: 'Dismiss' })}
              onClick={() => setNewKey(null)}
            />
          </div>
          <div className="flex items-center gap-2">
            <code className="glass-inset min-w-0 flex-1 truncate rounded-site-sm px-3 py-2 text-xs text-site-text">
              {newKey}
            </code>
            <CopyButton
              value={newKey}
              variant="accent"
              size="icon-sm"
              label={t('keys-copy-key', { defaultValue: 'Copy API key' })}
            />
          </div>
        </div>
      )}

      {/* Create form */}
      <div className="glass-fill space-y-3 rounded-site px-4 py-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={t('keys-name-label', { defaultValue: 'Key name' })}
          placeholder={t('keys-name-placeholder', { defaultValue: 'Key name (e.g. "My bot")' })}
          maxLength={100}
        />

        <div className="space-y-2">
          <p className="text-xs font-semibold text-site-text">
            {t('keys-scopes', { defaultValue: 'Scopes' })}
          </p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            {scopesByGroup().map((g) => (
              <div key={g.group}>
                <p className="text-xs font-semibold text-site-text-dim">{g.group}</p>
                {g.scopes.map((s) => (
                  <label
                    key={s.id}
                    className="flex min-h-8 items-center gap-2 text-xs text-site-text-muted"
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
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              onClick={() => setScopes(SCOPES.map((s) => s.id))}
              className="text-site-accent hover:underline"
            >
              {t('keys-select-all', { defaultValue: 'Select all' })}
            </button>
            <button
              type="button"
              onClick={() => setScopes([...DEFAULT_SCOPES])}
              className="text-site-accent hover:underline"
            >
              {t('keys-read-only', { defaultValue: 'Read-only' })}
            </button>
            <button
              type="button"
              onClick={() => setScopes([])}
              className="text-site-accent hover:underline"
            >
              {t('keys-clear', { defaultValue: 'Clear' })}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="api-key-expiry" className="text-xs text-site-text-muted">
            {t('keys-expires', { defaultValue: 'Expires' })}
          </label>
          <Select
            id="api-key-expiry"
            controlSize="sm"
            value={expiryDays}
            onChange={(e) => setExpiryDays(Number(e.target.value))}
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {t(o.key, { defaultValue: o.label })}
              </option>
            ))}
          </Select>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="accent"
            loading={creating}
            disabled={!name.trim()}
            onClick={create}
          >
            <Plus aria-hidden /> {t('keys-create', { defaultValue: 'Create key' })}
          </Button>
        </div>
      </div>

      <TestKeyCreator
        onCreated={(plaintext) => {
          setNewKey(plaintext);
          void load();
        }}
      />

      {keys.length === 0 ? (
        <p className="rounded-site border border-dashed border-site-border px-4 py-6 text-center text-sm text-site-text-muted">
          {t('keys-empty', { defaultValue: 'No keys yet. Create one to get started.' })}
        </p>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => {
            const expired = k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();
            return (
              <div key={k.id} className="glass-fill rounded-site px-4 py-3">
                <div className="flex items-center gap-3">
                  <KeyRound className="size-4 shrink-0 text-site-text-dim" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-site-text">{k.name}</p>
                    <p className="font-mono text-xs text-site-text-dim">
                      {k.prefix}…{k.lastFour ?? ''} ·{' '}
                      {k.lastUsedAt
                        ? t('keys-last-used', {
                            defaultValue: 'last used {{date}}',
                            date: new Date(k.lastUsedAt).toLocaleDateString(),
                          })
                        : t('keys-never-used', { defaultValue: 'never used' })}
                      {k.expiresAt && (
                        <span className={expired ? 'text-site-danger' : ''}>
                          {' '}
                          ·{' '}
                          {expired
                            ? t('keys-expired', { defaultValue: 'expired' })
                            : t('keys-expires-on', {
                                defaultValue: 'expires {{date}}',
                                date: new Date(k.expiresAt).toLocaleDateString(),
                              })}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      icon={Activity}
                      label={
                        usageFor === k.id
                          ? t('keys-hide-usage', { defaultValue: 'Hide usage' })
                          : t('keys-show-usage', { defaultValue: 'Show usage' })
                      }
                      aria-expanded={usageFor === k.id}
                      onClick={() => setUsageFor((cur) => (cur === k.id ? null : k.id))}
                    />
                    <IconButton
                      icon={RefreshCw}
                      label={t('keys-rotate', { defaultValue: 'Rotate key' })}
                      onClick={() => rotate(k.id)}
                    />
                    <IconButton
                      icon={Trash2}
                      label={t('keys-revoke', { defaultValue: 'Revoke key' })}
                      className="hover:text-site-danger"
                      onClick={() => revoke(k.id)}
                    />
                  </div>
                </div>
                {usageFor === k.id && <KeyUsage keyId={k.id} />}
                {k.scopes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <Badge key={s} variant="outline" size="sm" className="font-mono font-normal">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-site-text-dim">
        <BookOpen className="size-3.5" aria-hidden />
        <span>
          {t('keys-docs-lead', { defaultValue: 'New here?' })}{' '}
          <a
            href={DEVELOPER_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="text-site-accent hover:underline"
          >
            {t('keys-docs-link', { defaultValue: 'Read the API documentation' })}
          </a>
        </span>
      </p>
    </section>
  );
}
