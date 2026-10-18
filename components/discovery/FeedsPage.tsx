'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { FeedSummary } from '@/lib/discovery/feeds.server';
import { EMPTY_FEED_FORM, FeedForm, feedBody } from './FeedForm';

interface Lists {
  mine: FeedSummary[];
  subscribed: FeedSummary[];
  popular: FeedSummary[];
}

function FeedRow({ f }: { f: FeedSummary }) {
  const { t } = useTranslation('f-discovery');
  const bits = [...f.tags.map((x) => `#${x}`), ...f.keywords];
  return (
    <li>
      <Link
        to="/feeds/$id"
        params={{ id: f.id }}
        className="glass-fill block rounded-site p-3 hover:bg-site-surface-hover"
      >
        <p className="text-sm font-semibold text-site-text">{f.name}</p>
        <p className="mt-0.5 truncate text-xs text-site-text-muted">
          {bits.slice(0, 6).join(' · ')}
          {f.peopleCount
            ? ` · ${t('feeds-people', { count: f.peopleCount, defaultValue: '{{count}} people' })}`
            : ''}
        </p>
        {f.isPublic && (
          <p className="mt-0.5 text-xs text-site-text-dim">
            {t('feeds-subscribers', {
              count: f.subscriberCount,
              defaultValue: '{{count}} subscribers',
            })}
          </p>
        )}
      </Link>
    </li>
  );
}

function Section({ title, items }: { title: string; items: FeedSummary[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="site-section-label mb-2">{title}</h2>
      <ul className="space-y-2">
        {items.map((f) => (
          <FeedRow key={f.id} f={f} />
        ))}
      </ul>
    </section>
  );
}

/** /feeds - define feeds and find ones other members published (A4). */
export function FeedsPage() {
  const { t } = useTranslation('f-discovery');
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [lists, setLists] = useState<Lists | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/feeds', { credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      setLists((await res.json()) as Lists);
    } catch {
      toast.error(t('feeds-load-failed', { defaultValue: 'Could not load feeds' }));
    }
  }, [t]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  const create = async (v: Parameters<typeof feedBody>[0]) => {
    setBusy(true);
    try {
      const res = await fetch('/api/feeds', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedBody(v)),
      });
      const data = (await res.json().catch(() => null)) as {
        feed?: { id: string };
        error?: string;
      } | null;
      if (!res.ok || !data?.feed) {
        toast.error(
          data?.error ?? t('feeds-create-failed', { defaultValue: 'Could not create the feed' }),
        );
        return;
      }
      void navigate({ to: '/feeds/$id', params: { id: data.feed.id } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout
      title={t('feeds-title', { defaultValue: 'Custom feeds' })}
      description={t('feeds-desc', {
        defaultValue:
          'Build a feed from tags, people and keywords, or subscribe to one someone else made.',
      })}
    >
      <div className="space-y-5 px-4 pt-2 pb-12">
        {!session ? (
          <EmptyState
            title={t('feeds-signin', { defaultValue: 'Sign in to build and follow feeds' })}
            action={
              <Link to="/login" search={{ callbackURL: '/feeds' }}>
                <Button variant="accent">
                  {t('feeds-signin-cta', { defaultValue: 'Sign in' })}
                </Button>
              </Link>
            }
          />
        ) : !lists ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            {creating ? (
              <FeedForm
                initial={EMPTY_FEED_FORM}
                busy={busy}
                submitLabel={t('feeds-create', { defaultValue: 'Create feed' })}
                onSubmit={(v) => void create(v)}
                onCancel={() => setCreating(false)}
              />
            ) : (
              <Button variant="accent" size="sm" onClick={() => setCreating(true)}>
                <Plus aria-hidden /> {t('feeds-new', { defaultValue: 'New feed' })}
              </Button>
            )}
            <Section title={t('feeds-mine', { defaultValue: 'Your feeds' })} items={lists.mine} />
            <Section
              title={t('feeds-subscribed', { defaultValue: 'Subscribed' })}
              items={lists.subscribed}
            />
            <Section
              title={t('feeds-popular', { defaultValue: 'Popular feeds' })}
              items={lists.popular}
            />
          </>
        )}
      </div>
    </PageLayout>
  );
}
