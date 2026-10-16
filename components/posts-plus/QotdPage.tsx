'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { MessageCircleQuestion } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { VirtualPostList } from '@/components/feed/VirtualPostList';
import { ComposeBoxLazy } from '@/components/feed/ComposeBoxLazy';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { FeedItem } from '@/lib/feed-types';
import { useQotdAnswering } from '@/lib/posts-plus/qotd-store';

interface ArchiveDay {
  dayKey: string;
  text: string;
  source: 'curated' | 'builtin';
  answerCount: number;
}

interface AnswersPage {
  prompt: { dayKey: string; text: string };
  items: FeedItem[];
  nextCursor: string | null;
}

function formatDay(dayKey: string, locale?: string): string {
  return new Date(`${dayKey}T00:00:00Z`).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * /qotd - today's question with its answers (and the composer to add yours),
 * plus the last 30 days of questions with their answers. Answers are ordinary
 * posts; this page is just the day's thread.
 */
export function QotdPage({ day }: { day?: string }) {
  const { t, i18n } = useTranslation('f-posts-plus');
  const { data: session } = useSession();
  const [archive, setArchive] = useState<ArchiveDay[] | null>(null);
  const [page, setPage] = useState<AnswersPage | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = useQotdAnswering((s) => s.start);
  const clear = useQotdAnswering((s) => s.clear);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/qotd/archive')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { days: ArchiveDay[] } | null) => {
        if (!cancelled) setArchive(d?.days ?? []);
      })
      .catch(() => {
        if (!cancelled) setArchive([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = archive?.[0] ?? null;
  const selected = day && archive ? (archive.find((d) => d.dayKey === day) ?? today) : today;
  const isToday = !!selected && selected.dayKey === today?.dayKey;

  const load = useCallback(async (dayKey: string, cur: string | null) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ day: dayKey });
      if (cur) qs.set('cursor', cur);
      const res = await fetch(`/api/qotd/answers?${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as AnswersPage;
      setPage(data);
      setItems((prev) => (cur ? [...prev, ...data.items] : data.items));
      setCursor(data.nextCursor);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectedKey = selected?.dayKey;
  useEffect(() => {
    if (!selectedKey) return;
    setItems([]);
    setCursor(null);
    void load(selectedKey, null);
  }, [selectedKey, load]);

  // Anything posted from this page's composer while viewing today is an answer.
  useEffect(() => {
    if (isToday && selected && session) {
      start({ dayKey: selected.dayKey, text: selected.text });
      return () => clear();
    }
    return undefined;
  }, [isToday, selected, session, start, clear]);

  const focusComposer = () => {
    composerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    composerRef.current?.querySelector('textarea')?.focus({ preventScroll: true });
  };

  return (
    <PageLayout
      title={t('qotd-page-title', { defaultValue: 'Question of the day' })}
      description={t('qotd-page-desc', {
        defaultValue:
          'One question a day. Answer with a post - answers show up here and in the feed.',
      })}
    >
      <div className="space-y-6 px-4 pt-2 pb-12">
        {!archive || !selected ? (
          <Skeleton className="h-28 w-full rounded-site" />
        ) : (
          <section className="glass-pane rounded-site p-5">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
              <MessageCircleQuestion className="h-4 w-4 text-site-accent" aria-hidden />
              {isToday
                ? t('qotd-today', { defaultValue: 'Today' })
                : formatDay(selected.dayKey, i18n.language)}
            </p>
            <h2 className="mt-1 font-display text-xl font-medium text-site-text">
              {selected.text}
            </h2>
            <p className="mt-1 text-sm text-site-text-muted">
              {t('qotd-answer-count', { defaultValue: '{{n}} answers', n: selected.answerCount })}
            </p>
            {isToday && session && (
              <div className="mt-4" ref={composerRef}>
                <ComposeBoxLazy
                  onPosted={(item: FeedItem) => setItems((prev) => [item, ...prev])}
                />
              </div>
            )}
            {isToday && !session && (
              <div className="mt-4">
                <Link to="/login" search={{ callbackURL: '/qotd' }}>
                  <Button variant="accent" size="sm">
                    {t('qotd-sign-in', { defaultValue: 'Sign in to answer' })}
                  </Button>
                </Link>
              </div>
            )}
            {isToday && session && (
              <div className="mt-2">
                <Button variant="ghost" size="sm" onClick={focusComposer}>
                  {t('qotd-answer', { defaultValue: 'Answer' })}
                </Button>
              </div>
            )}
          </section>
        )}

        <section aria-label={t('qotd-answers', { defaultValue: 'Answers' })}>
          {loading && items.length === 0 && (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )}
          {failed && (
            <EmptyState
              title={t('qotd-load-failed', { defaultValue: 'Could not load the answers' })}
              action={
                <Button
                  variant="outline"
                  onClick={() => selectedKey && void load(selectedKey, null)}
                >
                  {t('retry', { defaultValue: 'Try again' })}
                </Button>
              }
            />
          )}
          {!failed && !loading && page && items.length === 0 && (
            <EmptyState
              icon={MessageCircleQuestion}
              title={t('qotd-no-answers', { defaultValue: 'No answers yet' })}
              description={
                isToday
                  ? t('qotd-no-answers-today', { defaultValue: 'Be the first to answer today.' })
                  : t('qotd-no-answers-past', { defaultValue: 'Nobody answered this one.' })
              }
            />
          )}
          {items.length > 0 && <VirtualPostList items={items} />}
          {cursor && selectedKey && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                loading={loading}
                onClick={() => void load(selectedKey, cursor)}
              >
                {t('load-more', { defaultValue: 'Load more' })}
              </Button>
            </div>
          )}
        </section>

        {archive && archive.length > 1 && (
          <section aria-labelledby="qotd-past">
            <h2 id="qotd-past" className="mb-2 text-sm font-semibold text-site-text">
              {t('qotd-past', { defaultValue: 'Past questions' })}
            </h2>
            <ul className="space-y-2">
              {archive.slice(1).map((d) => (
                <li key={d.dayKey}>
                  <Link
                    to="/qotd"
                    search={{ day: d.dayKey }}
                    aria-current={selected?.dayKey === d.dayKey ? 'true' : undefined}
                    className={cn(
                      'glass-fill glass-interactive flex items-baseline gap-3 rounded-site px-4 py-3',
                      selected?.dayKey === d.dayKey && 'border-site-accent',
                    )}
                  >
                    <span className="w-20 shrink-0 text-xs text-site-text-dim">
                      {formatDay(d.dayKey, i18n.language)}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-site-text">{d.text}</span>
                    <span className="shrink-0 text-xs text-site-text-muted">
                      {t('qotd-answer-count', { defaultValue: '{{n}} answers', n: d.answerCount })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageLayout>
  );
}
