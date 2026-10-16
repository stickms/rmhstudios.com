'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BookOpen, Plus } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { MAX_SERIES_TITLE } from '@/lib/posts-plus/constants';

interface Summary {
  id: string;
  title: string;
  description: string | null;
  postCount: number;
  followCount: number;
  author?: { name: string | null; handle: string | null };
}

/** /series - the series you have written and the ones you follow (X5). */
export function SeriesIndexPage() {
  const { t } = useTranslation('f-posts-plus');
  const { data: session, isPending } = useSession();
  const [data, setData] = useState<{ mine: Summary[]; following: Summary[] } | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/series', { credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch {
      setData({ mine: [], following: [] });
      toast.error(t('series-load-failed', { defaultValue: 'Could not load the series' }));
    }
  }, [t]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/series', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(
          err?.error ?? t('series-create-failed', { defaultValue: 'Could not create the series' }),
        );
        return;
      }
      setTitle('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const row = (s: Summary) => (
    <li key={s.id}>
      <Link
        to="/series/$id"
        params={{ id: s.id }}
        className="glass-fill glass-interactive block rounded-site px-4 py-3"
      >
        <span className="block text-sm font-medium text-site-text">{s.title}</span>
        <span className="block text-xs text-site-text-muted">
          {t('series-parts', { defaultValue: '{{n}} parts', n: s.postCount })}
          {s.author && (s.author.name || s.author.handle)
            ? ` · ${s.author.name ?? s.author.handle}`
            : ''}
        </span>
      </Link>
    </li>
  );

  return (
    <PageLayout
      title={t('series-index-title', { defaultValue: 'Series' })}
      description={t('series-index-desc', {
        defaultValue: 'Group your posts into a numbered series, and follow other people’s.',
      })}
    >
      {!session && !isPending ? (
        <SignedOutPrompt
          callbackURL="/series"
          title={t('series-sign-in-title', { defaultValue: 'Sign in to manage your series' })}
        />
      ) : !data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6 px-4 pt-2 pb-12">
          <form
            className="glass-pane flex gap-2 rounded-site p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, MAX_SERIES_TITLE))}
              placeholder={t('series-new-placeholder', { defaultValue: 'Name a new series' })}
              aria-label={t('series-new-placeholder', { defaultValue: 'Name a new series' })}
            />
            <Button
              type="submit"
              variant="accent"
              loading={busy}
              disabled={title.trim().length < 2}
            >
              <Plus aria-hidden />
              {t('series-create', { defaultValue: 'Create' })}
            </Button>
          </form>

          <section aria-labelledby="series-mine">
            <h2 id="series-mine" className="mb-2 text-sm font-semibold text-site-text">
              {t('series-mine', { defaultValue: 'Your series' })}
            </h2>
            {data.mine.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title={t('series-mine-empty', { defaultValue: 'No series yet' })}
                description={t('series-mine-empty-hint', {
                  defaultValue:
                    'Create one above, then add posts to it from the composer’s + menu.',
                })}
              />
            ) : (
              <ul className="space-y-2">{data.mine.map(row)}</ul>
            )}
          </section>

          {data.following.length > 0 && (
            <section aria-labelledby="series-following">
              <h2 id="series-following" className="mb-2 text-sm font-semibold text-site-text">
                {t('series-following', { defaultValue: 'Following' })}
              </h2>
              <ul className="space-y-2">{data.following.map(row)}</ul>
            </section>
          )}
        </div>
      )}
    </PageLayout>
  );
}
