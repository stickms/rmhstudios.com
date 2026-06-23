'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Loader2, Bot, Plus, MessageSquare, X, Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Persona {
  id: string;
  name: string;
  tagline: string | null;
  emoji: string | null;
  chatCount: number;
  owner?: { name: string | null; handle: string | null };
  isPublic?: boolean;
}

const fmt = (n: number) => n.toLocaleString();

export function PersonasColumn({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  const { t } = useTranslation('feed');
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [mine, setMine] = useState<Persona[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', tagline: '', emoji: '', greeting: '', systemPrompt: '', isPublic: true });

  const load = useCallback(async () => {
    const res = await fetch('/api/personas', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setPersonas(data.personas ?? []);
      setMine(data.mine ?? []);
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
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/personas', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          tagline: form.tagline.trim() || undefined,
          emoji: form.emoji.trim() || undefined,
          greeting: form.greeting.trim() || undefined,
          systemPrompt: form.systemPrompt.trim(),
          isPublic: form.isPublic,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t('could-not-create', { defaultValue: 'Could not create' }));
        return;
      }
      setForm({ name: '', tagline: '', emoji: '', greeting: '', systemPrompt: '', isPublic: true });
      setShowForm(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
      </div>
    );
  }

  const validForm = form.name.trim().length >= 2 && form.systemPrompt.trim().length >= 10;

  const Tile = (p: Persona, showOwner = true) => (
    <Link
      key={p.id}
      to={`/personas/${p.id}` as string}
      className="flex items-start gap-3 rounded-xl border border-site-border bg-site-surface p-3 transition-colors hover:border-site-accent/60"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-site-accent/12 text-xl">
        {p.emoji || <Bot className="h-5 w-5 text-site-accent" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-site-text">{p.name}</p>
        {p.tagline && <p className="truncate text-xs text-site-text-muted">{p.tagline}</p>}
        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-site-text-dim">
          <MessageSquare className="h-3 w-3" /> {fmt(p.chatCount)}
          {p.isPublic === false && (
            <>
              <span aria-hidden>·</span>
              <Lock className="h-3 w-3" /> {t('private', { defaultValue: 'private' })}
            </>
          )}
          {showOwner && p.owner && (
            <>
              <span aria-hidden>·</span> {t('by-owner', { owner: p.owner.name || p.owner.handle || t('someone', { defaultValue: 'someone' }), defaultValue: 'by {{owner}}' })}
            </>
          )}
        </p>
      </div>
    </Link>
  );

  return (
    <div className={hideHeader ? '' : 'min-h-screen'}>
      {hideHeader ? (
        signedIn && (
          <div className="flex justify-end px-4 pt-2">
            <Button size="sm" variant="accent" className="gap-1" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-3.5 w-3.5" /> {t('create', { defaultValue: 'Create' })}
            </Button>
          </div>
        )
      ) : (
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
          <Bot className="h-5 w-5 text-site-accent" />
          <h1 className="text-lg font-bold text-site-text">{t('ai-personas', { defaultValue: 'AI personas' })}</h1>
          {signedIn && (
            <Button size="sm" variant="accent" className="ml-auto gap-1" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-3.5 w-3.5" /> {t('create', { defaultValue: 'Create' })}
            </Button>
          )}
        </header>
      )}

      {showForm && (
        <div className="border-b border-site-border bg-site-surface/30 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-site-text">{t('new-persona', { defaultValue: 'New persona' })}</h2>
            <button onClick={() => setShowForm(false)} className="text-site-text-dim hover:text-site-text" aria-label={t('close', { defaultValue: 'Close' })}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                value={form.emoji}
                onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value.slice(0, 4) }))}
                placeholder="🤖"
                className="w-14 rounded-lg border border-site-border bg-site-bg px-3 py-2 text-center text-sm outline-none focus:border-site-accent"
              />
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('name-placeholder', { defaultValue: 'Name' })}
                maxLength={40}
                className="flex-1 rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
              />
            </div>
            <input
              value={form.tagline}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              placeholder={t('tagline-placeholder', { defaultValue: 'Short tagline (optional)' })}
              maxLength={120}
              className="w-full rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              placeholder={t('system-prompt-placeholder', { defaultValue: 'Personality & instructions — who is this character, how do they talk, what do they know?' })}
              maxLength={2000}
              rows={4}
              className="w-full resize-none rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <input
              value={form.greeting}
              onChange={(e) => setForm((f) => ({ ...f, greeting: e.target.value }))}
              placeholder={t('greeting-placeholder', { defaultValue: 'Opening greeting (optional)' })}
              maxLength={500}
              className="w-full rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isPublic: !f.isPublic }))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-site-border px-2.5 py-1.5 text-xs font-medium text-site-text-muted hover:text-site-text"
              >
                {form.isPublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {form.isPublic ? t('public', { defaultValue: 'Public' }) : t('private-label', { defaultValue: 'Private' })}
              </button>
              {error && <p className="text-xs text-site-danger">{error}</p>}
              <Button size="sm" variant="accent" disabled={!validForm || busy} onClick={create}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('create-persona', { defaultValue: 'Create persona' })}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6 p-4">
        {mine.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('your-personas', { defaultValue: 'Your personas' })}</h2>
            <div className="space-y-2">{mine.map((p) => Tile(p, false))}</div>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('popular', { defaultValue: 'Popular' })}</h2>
          {personas.length === 0 ? (
            <p className="py-12 text-center text-sm text-site-text-muted">{t('no-personas-yet', { defaultValue: 'No personas yet — create the first!' })}</p>
          ) : (
            <div className="space-y-2">{personas.map((p) => Tile(p))}</div>
          )}
        </section>
      </div>
    </div>
  );
}
