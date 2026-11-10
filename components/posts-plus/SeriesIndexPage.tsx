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
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { createSeriesApi, listSeriesApi } from '@/lib/posts-plus/series.contract';

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
      setData(await api(listSeriesApi));
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
      await api(createSeriesApi, { body: { title: title.trim() } });
      setTitle('');
      await load();
    } catch (e) {
      toast.error(
        serverError(e) ?? t('series-create-failed', { defaultValue: 'Could not create the series' }),
      );
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
        <span className="mt-1 block text-xs text-site-text-muted">
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
      <div className="max-w-2xl px-4 pt-4 pb-12">
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
        <div className="space-y-[var(--site-section-gap)]">
          <form
            className="glass-pane flex gap-2 rounded-site px-4 py-3"
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
            <h2 id="series-mine" className="site-section-label mb-3">
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
              <ul className="space-y-3">{data.mine.map(row)}</ul>
            )}
          </section>

          {data.following.length > 0 && (
            <section aria-labelledby="series-following">
              <h2 id="series-following" className="site-section-label mb-3">
                {t('series-following', { defaultValue: 'Following' })}
              </h2>
              <ul className="space-y-3">{data.following.map(row)}</ul>
            </section>
          )}
        </div>
      )}
      </div>
    </PageLayout>
  );
}
