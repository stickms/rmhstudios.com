'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Loader2, Shield, Plus, Trophy, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';

interface ClanRow {
  slug: string;
  name: string;
  tag: string;
  description: string | null;
  color: string | null;
  memberCount: number;
  totalXp: number;
  rank: number;
}

const fmt = (n: number) => n.toLocaleString();

export function ClansColumn() {
  const { t } = useTranslation('feed');
  const [clans, setClans] = useState<ClanRow[]>([]);
  const [myClanSlug, setMyClanSlug] = useState<string | null>(null);
  const [foundCost, setFoundCost] = useState(500);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', tag: '', description: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/clans', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setClans(data.clans ?? []);
      setMyClanSlug(data.myClanSlug ?? null);
      setFoundCost(data.foundCost ?? 500);
      setSignedIn(!!data.signedIn);
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
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/clans', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          tag: form.tag.trim(),
          description: form.description.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t('could-not-create-clan', { defaultValue: 'Could not create clan' }));
        return;
      }
      setShowForm(false);
      setForm({ name: '', tag: '', description: '' });
      await load();
    } finally {
      setCreating(false);
    }
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
        <Shield className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">{t('clans-heading', { defaultValue: 'Clans' })}</h1>
        {signedIn && !myClanSlug && (
          <Button size="sm" variant="accent" className="ml-auto gap-1" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> {t('found-a-clan', { defaultValue: 'Found a clan' })}
          </Button>
        )}
        {myClanSlug && (
          <Link to={`/clans/${myClanSlug}` as string} className="ml-auto">
            <Button size="sm" variant="outline" className="gap-1">
              <Shield className="h-3.5 w-3.5" /> {t('my-clan', { defaultValue: 'My clan' })}
            </Button>
          </Link>
        )}
      </header>

      {showForm && (
        <div className="border-b border-site-border bg-site-surface/30 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-site-text">{t('found-new-clan-heading', { defaultValue: 'Found a new clan' })}</h2>
            <button onClick={() => setShowForm(false)} className="text-site-text-dim hover:text-site-text" aria-label={t('close', { defaultValue: 'Close' })}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('clan-name-placeholder', { defaultValue: 'Clan name' })}
              maxLength={40}
              className="w-full rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <input
              value={form.tag}
              onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value.toUpperCase() }))}
              placeholder={t('clan-tag-placeholder', { defaultValue: 'Tag (2–6, e.g. RMH)' })}
              maxLength={6}
              className="w-full rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm uppercase text-site-text outline-none focus:border-site-accent"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t('clan-description-placeholder', { defaultValue: 'Description (optional)' })}
              maxLength={300}
              rows={2}
              className="w-full resize-none rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            {error && <p className="text-xs text-site-danger">{error}</p>}
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-xs text-site-text-dim">
                {t('costs-label', { defaultValue: 'Costs' })} <CoinIcon className="h-3.5 w-3.5" /> {fmt(foundCost)}
              </span>
              <Button
                size="sm"
                variant="accent"
                disabled={creating || form.name.trim().length < 2 || form.tag.trim().length < 2}
                onClick={create}
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('create-button', { defaultValue: 'Create' })}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4">
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
          <Trophy className="h-3.5 w-3.5" /> {t('leaderboard', { defaultValue: 'Leaderboard' })}
        </h2>
        {clans.length === 0 ? (
          <p className="py-12 text-center text-sm text-site-text-muted">{t('no-clans-yet', { defaultValue: 'No clans yet — found the first one!' })}</p>
        ) : (
          <div className="space-y-2">
            {clans.map((c) => (
              <Link
                key={c.slug}
                to={`/clans/${c.slug}` as string}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-colors hover:border-site-accent/60 ${
                  c.slug === myClanSlug ? 'border-site-accent/60 bg-site-accent/5' : 'border-site-border bg-site-surface'
                }`}
              >
                <span className="w-6 text-center text-sm font-bold text-site-text-dim">{c.rank}</span>
                <span
                  className="rounded-md px-2 py-1 text-xs font-extrabold text-white"
                  style={{ background: c.color || 'var(--site-accent)' }}
                >
                  {c.tag}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-site-text">{c.name}</p>
                  {c.description && <p className="truncate text-xs text-site-text-muted">{c.description}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-site-text">{fmt(c.totalXp)} XP</p>
                  <p className="inline-flex items-center gap-1 text-[11px] text-site-text-dim">
                    <Users className="h-3 w-3" /> {fmt(c.memberCount)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
