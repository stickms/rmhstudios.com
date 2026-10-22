'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Compass, Trophy } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { fetchJson } from '@/lib/http';
import { formatDuration } from '@/lib/delight/shared';

interface HuntData {
  state: {
    title: string;
    total: number;
    solved: number;
    finished: boolean;
    durationMs: number | null;
    hint: string | null;
    position: number | null;
  } | null;
  board: {
    rows: {
      durationMs: number | null;
      user: { id: string; name: string | null; image: string | null };
    }[];
  } | null;
}

/** Z2 — /hunt: where members submit answers and see the completion-time leaderboard. */
export function HuntPage() {
  const { t } = useTranslation('f-delight');
  const { data: session } = useSession();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ['delight', 'hunt'],
    queryFn: () => fetchJson<HuntData>('/api/hunt'),
    enabled: !!session,
  });

  const submit = async () => {
    setBusy(true);
    try {
      const r = await fetchJson<{ correct: boolean; finished?: boolean }>('/api/hunt/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      });
      if (!r.correct) toast.error(t('hunt-wrong', { defaultValue: 'Not quite. Keep looking.' }));
      else {
        toast.success(
          r.finished
            ? t('hunt-done-toast', { defaultValue: 'You finished the hunt!' })
            : t('hunt-right', { defaultValue: 'Correct! The next clue is waiting.' }),
        );
        setAnswer('');
        await q.refetch();
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('hunt-error', { defaultValue: 'Could not check that' }),
      );
    } finally {
      setBusy(false);
    }
  };

  const s = q.data?.state;
  return (
    <PageLayout
      title={t('hunt-title', { defaultValue: 'The hunt' })}
      description={t('hunt-desc', {
        defaultValue:
          'Clues are hidden on pages across the site. Find one, work out the answer, and enter it here.',
      })}
    >
      <div className="space-y-6 px-4 pt-2 pb-12">
        {!session ? (
          <SignedOutPrompt
            icon={Compass}
            title={t('hunt-signed-out', { defaultValue: 'Sign in to join the hunt' })}
            callbackURL="/hunt"
          />
        ) : q.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : !s ? (
          <EmptyState
            icon={Compass}
            title={t('hunt-none', { defaultValue: 'No hunt is running right now' })}
            description={t('hunt-none-desc', { defaultValue: 'Check back later.' })}
          />
        ) : (
          <>
            <section className="glass-pane space-y-3 rounded-site p-4">
              <h2 className="text-lg font-semibold text-site-text">{s.title}</h2>
              <p className="text-sm text-site-text-muted">
                {t('hunt-progress', {
                  defaultValue: '{{solved}} of {{total}} clues solved',
                  solved: s.solved,
                  total: s.total,
                })}
              </p>
              {s.finished ? (
                <p className="text-site-text">
                  {t('hunt-finished', {
                    defaultValue: 'Finished in {{time}}. You earned the Site Hunter badge.',
                    time: formatDuration(s.durationMs ?? 0),
                  })}
                </p>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  <p className="text-site-text">
                    {s.hint ??
                      t('hunt-no-hint', {
                        defaultValue: 'Explore. The next clue is hidden somewhere on the site.',
                      })}
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={answer}
                      maxLength={120}
                      onChange={(e) => setAnswer(e.target.value)}
                      aria-label={t('hunt-answer', { defaultValue: 'Your answer' })}
                      placeholder={t('hunt-answer', { defaultValue: 'Your answer' })}
                    />
                    <Button type="submit" variant="accent" loading={busy} disabled={!answer.trim()}>
                      {t('hunt-submit', { defaultValue: 'Submit' })}
                    </Button>
                  </div>
                </form>
              )}
            </section>

            <section aria-labelledby="hunt-board">
              <h2
                id="hunt-board"
                className="mb-2 flex items-center gap-2 text-sm font-semibold text-site-text"
              >
                <Trophy className="size-4" aria-hidden />
                {t('hunt-board', { defaultValue: 'Fastest finishers' })}
              </h2>
              {q.data?.board?.rows.length ? (
                <ol className="space-y-2">
                  {q.data.board.rows.map((r, i) => (
                    <li
                      key={r.user.id}
                      className="glass-fill flex items-center gap-3 rounded-site px-4 py-2"
                    >
                      <span className="w-6 text-sm text-site-text-dim">{i + 1}</span>
                      <UserAvatar
                        src={r.user.image}
                        alt=""
                        size={28}
                        fallbackName={r.user.name ?? ''}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-site-text">
                        {r.user.name}
                      </span>
                      <span className="text-sm tabular-nums text-site-text-muted">
                        {formatDuration(r.durationMs ?? 0)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-site-text-muted">
                  {t('hunt-board-empty', { defaultValue: 'Nobody has finished yet.' })}
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </PageLayout>
  );
}
