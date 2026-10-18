'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Flag, Sparkles, Star, Trash2, EyeOff } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/ui/copy-button';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useSession } from '@/components/Providers';
import { PACK_MAX_PROMPTS, PACK_MIN_PROMPTS, type PackView } from '@/lib/party/packs';

interface PackLists {
  featured: PackView[];
  recent: PackView[];
  mine: PackView[];
}

export function PacksPage() {
  const { t } = useTranslation('f-party');
  const session = useSession();
  const signedIn = !!session.data?.user;
  const isAdmin = !!(session.data?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
  const confirm = useConfirm();
  const [lists, setLists] = useState<PackLists | null>(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/rmhbox/packs').catch(() => null);
    if (res?.ok) setLists((await res.json()) as PackLists);
    else toast.error(t('load-failed', { defaultValue: 'Could not load packs.' }));
  }, [t]);

  useEffect(() => {
    void load();
  }, [load, signedIn]);

  const prompts = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  async function create() {
    setBusy(true);
    const res = await fetch('/api/rmhbox/packs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, prompts }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      const { pack } = (await res.json()) as { pack: PackView };
      toast.success(
        t('created', { defaultValue: 'Pack created. Share code {{code}}.', code: pack.code }),
      );
      setName('');
      setText('');
      void load();
    } else {
      const err = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
      toast.error(err.error ?? t('create-failed', { defaultValue: 'Could not create the pack.' }));
    }
  }

  async function act(pack: PackView, action: 'report' | 'delete' | 'feature' | 'hide') {
    if (action === 'report') {
      const ok = await confirm({
        title: t('report-title', { defaultValue: 'Report this pack?' }),
        description: t('report-desc', {
          defaultValue: 'Packs with several reports are hidden until a moderator reviews them.',
        }),
        confirmLabel: t('report', { defaultValue: 'Report' }),
        danger: true,
      });
      if (!ok) return;
    }
    const url = `/api/rmhbox/packs/${pack.id}`;
    const res = await fetch(
      action === 'report' ? `${url}/report` : url,
      action === 'report'
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Inappropriate or unsafe prompts' }),
          }
        : action === 'delete'
          ? { method: 'DELETE' }
          : {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(
                action === 'feature' ? { featured: !pack.featured } : { hidden: !pack.hidden },
              ),
            },
    ).catch(() => null);
    if (res?.ok) {
      if (action === 'report') toast.success(t('reported', { defaultValue: 'Thanks, reported.' }));
      void load();
    } else toast.error(t('action-failed', { defaultValue: 'That did not work.' }));
  }

  const card = (p: PackView) => (
    <Card key={p.id} className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-site-text">{p.name}</h3>
          <p className="text-xs text-site-text-muted">
            {t('pack-meta', {
              defaultValue: '{{count}} prompts by {{author}}',
              count: p.promptCount,
              author: p.author?.name ?? p.author?.handle ?? '?',
            })}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {p.featured ? (
            <Badge variant="accent">{t('featured', { defaultValue: 'Featured' })}</Badge>
          ) : null}
          {p.hidden ? (
            <Badge variant="danger">{t('hidden', { defaultValue: 'Hidden' })}</Badge>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="glass-inset rounded-site px-2.5 py-1 font-mono text-sm tracking-widest text-site-text">
          {p.code}
        </code>
        <CopyButton
          value={p.code}
          size="xs"
          variant="outline"
          label={t('copy-code', { defaultValue: 'Copy code' })}
        />
        {signedIn && !p.mine ? (
          <Button size="xs" variant="ghost" onClick={() => void act(p, 'report')}>
            <Flag aria-hidden />
            {t('report', { defaultValue: 'Report' })}
          </Button>
        ) : null}
        {p.mine || isAdmin ? (
          <Button size="xs" variant="ghost" onClick={() => void act(p, 'delete')}>
            <Trash2 aria-hidden />
            {t('delete', { defaultValue: 'Delete' })}
          </Button>
        ) : null}
        {isAdmin ? (
          <>
            <Button size="xs" variant="outline" onClick={() => void act(p, 'feature')}>
              <Star aria-hidden />
              {p.featured
                ? t('unfeature', { defaultValue: 'Unfeature' })
                : t('feature', { defaultValue: 'Feature' })}
            </Button>
            <Button size="xs" variant="outline" onClick={() => void act(p, 'hide')}>
              <EyeOff aria-hidden />
              {p.hidden
                ? t('unhide', { defaultValue: 'Unhide' })
                : t('hide', { defaultValue: 'Hide' })}
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  );

  const section = (title: string, items: PackView[], empty: string) => (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-bold text-site-text">{title}</h2>
      {items.length ? (
        <div className="grid gap-3 sm:grid-cols-2">{items.map(card)}</div>
      ) : (
        <p className="text-sm text-site-text-muted">{empty}</p>
      )}
    </section>
  );

  return (
    <PageLayout
      title={t('packs-title', { defaultValue: 'RMHBox prompt packs' })}
      description={t('packs-desc', {
        defaultValue:
          'Write your own Wit-War prompts, share the code, and the host picks it in the lobby game settings.',
      })}
    >
      <div className="space-y-6 px-4 pb-12">
        {signedIn ? (
          <Card pane className="space-y-3 p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-site-text">
              <Sparkles className="h-4 w-4 text-site-accent" aria-hidden />
              {t('new-pack', { defaultValue: 'Make a pack' })}
            </h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder={t('name-ph', { defaultValue: 'Pack name' })}
              aria-label={t('name-ph', { defaultValue: 'Pack name' })}
              className="glass-inset h-11 w-full rounded-[var(--site-control-radius)] px-3.5 text-sm text-site-text"
            />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              aria-label={t('prompts-label', { defaultValue: 'Prompts, one per line' })}
              placeholder={t('prompts-ph', {
                defaultValue: 'One prompt per line, e.g. The worst thing to say at a job interview',
              })}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-site-text-muted">
                {t('prompt-count', {
                  defaultValue: '{{count}} prompts (need {{min}} to {{max}})',
                  count: prompts.length,
                  min: PACK_MIN_PROMPTS,
                  max: PACK_MAX_PROMPTS,
                })}
              </span>
              <Button
                variant="accent"
                disabled={
                  busy ||
                  name.trim().length < 3 ||
                  prompts.length < PACK_MIN_PROMPTS ||
                  prompts.length > PACK_MAX_PROMPTS
                }
                onClick={() => void create()}
              >
                {t('publish', { defaultValue: 'Publish pack' })}
              </Button>
            </div>
          </Card>
        ) : (
          <p className="text-sm text-site-text-muted">
            {t('sign-in', { defaultValue: 'Sign in to make and report packs.' })}
          </p>
        )}
        {!lists ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            {signedIn
              ? section(
                  t('mine', { defaultValue: 'Your packs' }),
                  lists.mine,
                  t('mine-empty', { defaultValue: 'You have not made a pack yet.' }),
                )
              : null}
            {section(
              t('featured-shelf', { defaultValue: 'Featured packs' }),
              lists.featured,
              t('featured-empty', { defaultValue: 'Nothing featured yet.' }),
            )}
            {section(
              t('community', { defaultValue: 'Community packs' }),
              lists.recent,
              t('community-empty', { defaultValue: 'No community packs yet.' }),
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
