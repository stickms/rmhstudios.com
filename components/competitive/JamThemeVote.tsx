import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { castJamThemeVotesApi } from '@/lib/competitive/jam-themes.contract';
import { jamThemeVoteQuery } from '@/lib/competitive/jam-themes.queries';
import { MAX_THEME_MARKS } from '@/lib/competitive/jam-themes';
import { cn } from '@/lib/utils';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

/**
 * "Vote for the theme" (before the jam starts): the shortlist as checkbox rows, at most three marks. No count and
 * no winner is ever on this view; the server sends none before the start.
 */
export function JamThemeVote({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const { t } = useTranslation('jam-themes');
  const fmt = useLocaleFormat();
  const queryClient = useQueryClient();
  const query = jamThemeVoteQuery(slug);
  const { data, isError } = useQuery(query);
  const view = data?.view;
  // The marks being edited; null until the member touches a box (then the server's own marks are shown).
  const [draft, setDraft] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const arrival = useArrival(view !== undefined);

  if (isError) return null;
  if (!view) return <Skeleton className="h-32 rounded-site" />;
  if (!view.enabled || view.candidates.length === 0) return null;

  const marks = draft ?? view.mine;
  const open = view.phase === 'open';
  const full = marks.length >= MAX_THEME_MARKS;
  const changed = draft !== null && [...draft].sort().join() !== [...view.mine].sort().join();

  const toggle = (id: string) => setDraft(marks.includes(id) ? marks.filter((m) => m !== id) : [...marks, id]);

  const save = async () => {
    setBusy(true);
    try {
      await api(castJamThemeVotesApi, {
        params: {
          slug,
        },
        body: {
          candidateIds: marks,
        },
      });
      toast.success(
        t('vote-saved', {
          defaultValue: 'Your votes are saved',
        }),
      );
      setDraft(null);
      await queryClient.invalidateQueries({
        queryKey: query.queryKey,
      });
    } catch (e) {
      toast.error(
        serverError(e) ??
          t('vote-failed', {
            defaultValue: 'Could not save your votes',
          }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cn('space-y-2', arrival)} aria-labelledby="jam-theme-vote-title">
      <h2 id="jam-theme-vote-title" className="t-heading">
        {t('vote-title', {
          defaultValue: 'Vote for the theme',
        })}
      </h2>
      <p className="t-meta">
        {view.phase === 'before' && view.opensAt
          ? t('vote-opens', {
              defaultValue: 'Theme voting opens {{time}}',
              time: fmt.dateTime(new Date(view.opensAt)),
            })
          : t('vote-closes', {
              defaultValue: 'Voting closes when the jam starts, {{time}}',
              time: fmt.dateTime(new Date(view.closesAt)),
            })}
      </p>
      <p id="jam-theme-vote-hint" className="sr-only" aria-live="polite">
        {t('vote-hint', {
          defaultValue: 'Mark up to {{max}} themes. {{n}} marked.',
          max: MAX_THEME_MARKS,
          n: marks.length,
        })}
      </p>
      <ul role="group" aria-labelledby="jam-theme-vote-title" aria-describedby="jam-theme-vote-hint">
        {view.candidates.map((c) => {
          const checked = marks.includes(c.id);
          const blocked = !checked && full;
          return (
            <li key={c.id} className="border-b border-site-border">
              <label
                className={cn(
                  't-body flex min-h-9 items-center gap-3 py-2 pointer-coarse:min-h-11',
                  open && !blocked && 'cursor-pointer',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!open || !signedIn || blocked}
                  onChange={() => toggle(c.id)}
                  className="size-4 shrink-0 accent-site-text pointer-coarse:size-5"
                />
                <span className="min-w-0 flex-1">{c.text}</span>
                {blocked && open && signedIn && (
                  <span className="t-meta">
                    {t('vote-max', {
                      defaultValue: 'You can mark up to {{max}}',
                      max: MAX_THEME_MARKS,
                    })}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      {!signedIn ? (
        <p className="t-body">
          <Link to="/login" className="underline">
            {t('vote-sign-in', {
              defaultValue: 'Sign in to vote',
            })}
          </Link>
        </p>
      ) : (
        open && (
          <Button variant="primary" onClick={save} loading={busy} disabled={!changed}>
            {t('vote-save', {
              defaultValue: 'Save votes',
            })}
          </Button>
        )
      )}
    </section>
  );
}

/** The jam list's mark for a jam whose theme vote is open. */
export function ThemeVoteOpenLabel() {
  const { t } = useTranslation('jam-themes');
  return (
    <p className="t-label">
      {t('list-vote-open', {
        defaultValue: 'Theme vote open',
      })}
    </p>
  );
}
