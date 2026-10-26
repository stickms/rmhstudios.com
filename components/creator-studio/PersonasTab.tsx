/**
 * Create · AI Personas tab.
 *
 * The AI-persona gallery, rendered as a Steam-style storefront (rotating hero +
 * spotlight rail + varied mosaic) via the shared `Storefront`, with the inline
 * "create a persona" form on top. "Your personas" stay pinned in their own strip
 * above the public showcase, which re-advertises a different mix on each load.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bot, Plus, MessageSquare, X, Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { Storefront, type StoreItem } from '@/components/creator-studio/storefront';
import { runLiquidOpen, liquidVTName } from '@/lib/view-transition';
import '@/components/creator-studio/storefront.css';

interface Persona {
  id: string;
  name: string;
  tagline: string | null;
  emoji: string | null;
  avatarUrl?: string | null;
  chatCount: number;
  owner?: { name: string | null; handle: string | null };
  isPublic?: boolean;
}

const fmt = (n: number) => n.toLocaleString();

function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function PersonasTab({ seed }: { seed: number }) {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [mine, setMine] = useState<Persona[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    tagline: '',
    emoji: '',
    greeting: '',
    systemPrompt: '',
    isPublic: true,
  });

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

  const personaMeta = useCallback(
    (p: Persona, showOwner: boolean) => (
      <span className="store-persona-meta">
        <MessageSquare className="size-3" aria-hidden /> {fmt(p.chatCount)}
        {p.isPublic === false && (
          <>
            <span aria-hidden> · </span>
            <Lock className="size-3" aria-hidden /> {t('private', { defaultValue: 'Private' })}
          </>
        )}
        {showOwner && p.owner && (
          <>
            <span aria-hidden> · </span>
            {t('by-owner', {
              owner: p.owner.name || p.owner.handle || t('someone', { defaultValue: 'Someone' }),
              defaultValue: 'by {{owner}}',
            })}
          </>
        )}
      </span>
    ),
    [t],
  );

  const items: StoreItem[] = useMemo(
    () =>
      personas.map((p) => ({
        id: p.id,
        title: p.name,
        description: p.tagline ?? undefined,
        coverUrl: p.avatarUrl ?? null,
        emoji: p.emoji,
        hue: hueFor(p.id),
        cta: t('chat', { defaultValue: 'Chat' }),
        to: `/personas/${p.id}`,
        meta: personaMeta(p, true),
      })),
    [personas, t, personaMeta],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const validForm = form.name.trim().length >= 2 && form.systemPrompt.trim().length >= 10;

  return (
    <div className="store-personas">
      {signedIn && (
        <div className="store-personas__bar">
          <Button
            size="sm"
            variant="accent"
            aria-expanded={showForm}
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus aria-hidden /> {t('create', { defaultValue: 'Create' })}
          </Button>
        </div>
      )}

      {showForm && (
        <div className="glass-pane mb-6 space-y-3 rounded-site p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="site-section-label">
              {t('new-persona', { defaultValue: 'New persona' })}
            </h2>
            <IconButton
              icon={X}
              size="icon-xs"
              label={t('close', { defaultValue: 'Close' })}
              onClick={() => setShowForm(false)}
            />
          </div>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={form.emoji}
                onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value.slice(0, 4) }))}
                placeholder="🤖"
                aria-label={t('emoji-label', { defaultValue: 'Emoji' })}
                className="w-16 text-center"
              />
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('name-placeholder', { defaultValue: 'Name' })}
                aria-label={t('name-placeholder', { defaultValue: 'Name' })}
                maxLength={40}
                className="flex-1"
              />
            </div>
            <Input
              value={form.tagline}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              placeholder={t('tagline-placeholder', { defaultValue: 'Short tagline (optional)' })}
              aria-label={t('tagline-placeholder', { defaultValue: 'Short tagline (optional)' })}
              maxLength={120}
            />
            <Textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              placeholder={t('system-prompt-placeholder', {
                defaultValue:
                  'Personality & instructions — who is this character, how do they talk, what do they know?',
              })}
              aria-label={t('system-prompt-label', {
                defaultValue: 'Personality and instructions',
              })}
              maxLength={2000}
              rows={4}
            />
            <Input
              value={form.greeting}
              onChange={(e) => setForm((f) => ({ ...f, greeting: e.target.value }))}
              placeholder={t('greeting-placeholder', {
                defaultValue: 'Opening greeting (optional)',
              })}
              aria-label={t('greeting-placeholder', {
                defaultValue: 'Opening greeting (optional)',
              })}
              maxLength={500}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={form.isPublic}
                onClick={() => setForm((f) => ({ ...f, isPublic: !f.isPublic }))}
              >
                {form.isPublic ? <Globe aria-hidden /> : <Lock aria-hidden />}
                {form.isPublic
                  ? t('public', { defaultValue: 'Public' })
                  : t('private-label', { defaultValue: 'Private' })}
              </Button>
              {error && (
                <p role="alert" className="text-xs text-site-danger">
                  {error}
                </p>
              )}
              <Button
                size="sm"
                variant="accent"
                loading={busy}
                disabled={!validForm}
                onClick={create}
              >
                {t('create-persona', { defaultValue: 'Create persona' })}
              </Button>
            </div>
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <section className="mb-6 space-y-3">
          <h2 className="site-section-label">
            {t('your-personas', { defaultValue: 'Your personas' })}
          </h2>
          <div className="store-personas__mine">
            {mine.map((p) => (
              <Link
                key={p.id}
                to={`/personas/${p.id}` as string}
                // §5.48: the tile avatar liquidly expands into the chat header
                // avatar. Name set only at click time (tag the avatar child).
                onClick={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  const avatar = e.currentTarget.querySelector(
                    '[data-persona-avatar]',
                  ) as HTMLElement | null;
                  runLiquidOpen(avatar, liquidVTName('persona', p.id), () =>
                    navigate({ to: `/personas/${p.id}` } as never),
                  );
                }}
                className="glass-fill glass-interactive flex items-start gap-3 rounded-site px-3 py-3"
              >
                <div
                  data-persona-avatar
                  className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-site bg-site-accent-dim text-xl"
                >
                  {p.avatarUrl ? (
                    <img
                      src={p.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    p.emoji || <Bot className="size-5 text-site-accent" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-site-text">{p.name}</p>
                  {p.tagline && (
                    <p className="truncate text-xs text-site-text-muted">{p.tagline}</p>
                  )}
                  <p className="mt-0.5 text-xs text-site-text-dim">{personaMeta(p, false)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Storefront
        items={items}
        seed={seed}
        emptyLabel={t('no-personas-yet', { defaultValue: 'No personas yet — create the first!' })}
      />
    </div>
  );
}
