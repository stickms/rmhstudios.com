import { useRefusalText } from '@/components/errors/useRefusalText';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/rules';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Hammer } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { api } from '@/lib/contract/client';
import { enterJamApi, rateJamEntryApi } from '@/lib/competitive/jams.contract';
import { jamQuery } from '@/lib/competitive/jams.queries';
import { JAM_CATEGORIES, type JamCategory } from '@/lib/competitive/jam';
import { FEEDBACK_MIN, type MyFeedbackDTO } from '@/lib/competitive/jam-feedback';
import { JamFeedbackField } from './JamFeedbackField';
import { JamFeedbackList } from './JamFeedbackList';
import type { TeamPersonDTO, ViewerTeamState } from '@/lib/competitive/jam-teams';
import { EntryCredit, JamTeamPanel } from './JamTeamPanel';
import { PhaseBadge } from './JamsList';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { JamThemeVote } from './JamThemeVote';
import { JamThemeResults } from './JamThemeResults';

type Scores = Record<JamCategory, number>;
interface Entry {
  id: string;
  own: boolean;
  build: { slug: string; title: string; description: string; thumbnailUrl: string | null };
  user: TeamPersonDTO;
  /** Accepted teammates, credited beside the submitter. */
  team: TeamPersonDTO[];
  viewerTeamState: ViewerTeamState;
  /** The server's answer to whether the viewer may rate this entry. */
  rateable: boolean;
  averages: Scores | null;
  ratingCount: number;
  score: number;
  /** s06-07: feedback on this entry; null unless the viewer is on its team. */
  feedbackCount: number | null;
}
interface Jam {
  slug: string;
  title: string;
  description: string;
  theme: string | null;
  startsAt: string;
  submitEndsAt: string;
  ratingEndsAt: string;
  phase: 'upcoming' | 'open' | 'rating' | 'done';
  /** s07-07: members vote on this jam's theme. */
  themeVoting: boolean;
  entries: Entry[];
  myEntryId: string | null;
  /** The entry the viewer is credited on as a teammate; they cannot submit their own. */
  teamEntryId: string | null;
  myRatings: Record<string, Scores>;
  /** s06-07: the viewer's own feedback per entry (to re-open the form with it). */
  myFeedback: Record<string, MyFeedbackDTO>;
  myBuilds: { id: string; title: string }[];
  results: boolean;
}

function RateForm({
  slug,
  entry,
  initial,
  initialFeedback,
  onSaved,
}: {
  slug: string;
  entry: Entry;
  initial?: Scores;
  initialFeedback?: MyFeedbackDTO;
  onSaved: () => void;
}) {
  const { t } = useTranslation('f-competitive');
  const refusalText = useRefusalText();
  const [scores, setScores] = useState<Partial<Scores>>(initial ?? {});
  const [feedback, setFeedback] = useState(initialFeedback?.body ?? '');
  const [anonymous, setAnonymous] = useState(initialFeedback?.anonymous ?? false);
  const [busy, setBusy] = useState(false);
  const names: Record<JamCategory, string> = {
    fun: t('cat-fun', { defaultValue: 'Fun' }),
    creativity: t('cat-creativity', { defaultValue: 'Creativity' }),
    theme: t('cat-theme', { defaultValue: 'Theme' }),
    polish: t('cat-polish', { defaultValue: 'Polish' }),
  };
  const feedbackLength = feedback.trim().length;
  const ready = JAM_CATEGORIES.every((c) => scores[c]) && (feedbackLength === 0 || feedbackLength >= FEEDBACK_MIN);
  const save = async () => {
    setBusy(true);
    try {
      const res = await api(rateJamEntryApi, {
        params: { slug },
        body: { entryId: entry.id, ...(scores as Scores), feedback, anonymous },
      });
      if (res.feedback === 'blocked' || res.feedback === 'banned') {
        toast.error(
          t('feedback-not-saved', { ns: 'jam-feedback', defaultValue: 'Your scores were saved, but your feedback could not be.' }),
        );
      } else {
        toast.success(t('jam-rated', { defaultValue: 'Rating saved' }));
      }
      onSaved();
    } catch (e) {
      toast.error(
        refusalText.maybe(e) ?? t('jam-rate-failed', { defaultValue: 'Could not save rating' }),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      {JAM_CATEGORIES.map((c) => (
        <label key={c} className="flex flex-col gap-2 text-xs text-site-text-muted">
          {names[c]}
          <Select
            value={scores[c] ?? ''}
            onChange={(e) => setScores((s) => ({ ...s, [c]: Number(e.target.value) }))}
          >
            <option value="">–</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </label>
      ))}
      <JamFeedbackField
        value={feedback}
        anonymous={anonymous}
        onChange={setFeedback}
        onAnonymousChange={setAnonymous}
      />
      <Button size="sm" className="col-span-2" disabled={!ready} loading={busy} onClick={save}>
        {t('jam-rate', { defaultValue: 'Save rating' })}
      </Button>
    </div>
  );
}

export function JamDetail({ slug }: { slug: string }) { const fmt = useLocaleFormat(); 
  const { t } = useTranslation('f-competitive');
  const refusalText = useRefusalText();
  const { data: session } = useSession();
  const signedIn = !!session?.user?.id;
  const queryClient = useQueryClient();
  const query = jamQuery(slug);
  const { data, isError } = useQuery(query);
  // undefined while loading; null when the jam does not exist.
  const jam: Jam | null | undefined = data?.jam ?? (isError ? null : undefined);
  const [buildId, setBuildId] = useState('');
  const [busy, setBusy] = useState(false);
  const arrival = useArrival(jam !== undefined);

  const load = () => queryClient.invalidateQueries({ queryKey: query.queryKey });

  if (jam === undefined) return <Skeleton className="h-48 rounded-site" />;
  if (jam === null) {
    return (
      <EmptyState
        icon={Hammer}
        className={arrival}
        title={t('jam-missing', { defaultValue: 'This jam does not exist.' })}
      />
    );
  }

  const enter = async () => {
    setBusy(true);
    try {
      await api(enterJamApi, { params: { slug }, body: { buildId } });
      toast.success(t('jam-entered', { defaultValue: 'Entry saved' }));
      await load();
    } catch (e) {
      toast.error(refusalText.maybe(e) ?? t('jam-enter-failed', { defaultValue: 'Could not enter' }));
    } finally {
      setBusy(false);
    }
  };

  const viewerId = session?.user?.id ?? '';
  return (
    <div className={cn('space-y-4 max-w-3xl', arrival)}>
      <Section className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between gap-2">
          <p dir="auto" className="text-sm">{jam.description}</p>
          <PhaseBadge phase={jam.phase} />
        </div>
        <p className="text-sm">
          <span className="text-site-text-muted">{t('jam-theme', { defaultValue: 'Theme' })}: </span>
          <strong>
            {jam.theme ?? t('jam-theme-hidden', { defaultValue: 'Revealed when the jam starts' })}
          </strong>
        </p>
        <p className="text-xs text-site-text-muted">
          {fmt.dateTime(new Date(jam.startsAt))} → {fmt.dateTime(new Date(jam.submitEndsAt))}{' '}
          ·{' '}
          {t('jam-rating-until', {
            defaultValue: 'rating until {{when}}',
            when: fmt.dateTime(new Date(jam.ratingEndsAt)),
          })}
        </p>
      </Section>

      {jam.themeVoting && jam.phase === 'upcoming' && <JamThemeVote slug={slug} signedIn={signedIn} />}
      {jam.themeVoting && jam.phase !== 'upcoming' && <JamThemeResults slug={slug} />}

      {jam.phase === 'open' && signedIn && !jam.teamEntryId && (
        <Section className="flex flex-col gap-3 py-4">
          <h2 className="site-section-label">
            {t('jam-submit', { defaultValue: 'Submit a build' })}
          </h2>
          {jam.myBuilds.length === 0 ? (
            <p className="text-sm text-site-text-muted">
              {t('jam-no-builds', {
                defaultValue:
                  'Publish a public User Build during the jam, then come back to enter it.',
              })}{' '}
              <Link to="/create/builds" className="underline">
                {t('jam-builds-link', { defaultValue: 'Your builds' })}
              </Link>
            </p>
          ) : (
            <div className="flex gap-2">
              <Select
                value={buildId}
                onChange={(e) => setBuildId(e.target.value)}
                className="flex-1"
              >
                <option value="">{t('jam-pick-build', { defaultValue: 'Choose a build' })}</option>
                {jam.myBuilds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </Select>
              <Button onClick={enter} loading={busy} disabled={!buildId}>
                {jam.myEntryId
                  ? t('jam-swap', { defaultValue: 'Swap entry' })
                  : t('jam-enter', { defaultValue: 'Enter' })}
              </Button>
            </div>
          )}
        </Section>
      )}

      {jam.phase !== 'upcoming' && (
        <div className="space-y-3">
          <h2 className="site-section-label">
            {jam.results
              ? t('jam-results', { defaultValue: 'Results' })
              : t('jam-entries', { defaultValue: 'Entries' })}
          </h2>
          {jam.entries.length === 0 && (
            <p className="text-sm text-site-text-muted">
              {t('jam-no-entries', { defaultValue: 'No entries yet.' })}
            </p>
          )}
          {jam.entries.map((e, i) => (
            <Section key={e.id} className="flex flex-col gap-2 py-4">
              <div className="flex items-center justify-between gap-2">
                <Link
                  to="/builds/$slug"
                  params={{ slug: e.build.slug }}
                  className="font-semibold truncate"
                >
                  {jam.results ? `${i + 1}. ` : ''}
                  {e.build.title}
                </Link>
                {jam.results && <span className="font-medium">{e.score.toFixed(2)}</span>}
              </div>
              <p className="text-xs text-site-text-muted">
                <EntryCredit owner={e.user} team={e.team} />
                {jam.results &&
                  ` · ${t('jam-ratings', { count: Number(e.ratingCount), defaultValue_one: '{{n}} rating', defaultValue: '{{n}} ratings', n: e.ratingCount })}`}
              </p>
              {jam.results && e.averages && (
                <p className="text-xs text-site-text-muted">
                  {JAM_CATEGORIES.map((c) => `${c} ${e.averages![c].toFixed(1)}`).join(' · ')}
                </p>
              )}
              {e.rateable && (
                <RateForm
                  slug={slug}
                  entry={e}
                  initial={jam.myRatings[e.id]}
                  initialFeedback={jam.myFeedback[e.id]}
                  onSaved={load}
                />
              )}
              {e.feedbackCount !== null && (
                <JamFeedbackList slug={slug} entryId={e.id} count={e.feedbackCount} />
              )}
              {jam.myFeedback[e.id]?.helpful && (
                <p className="t-meta">
                  {t('team-found-helpful', { ns: 'jam-feedback', defaultValue: 'The team found this helpful' })}
                </p>
              )}
              {signedIn && (
                <JamTeamPanel
                  slug={slug}
                  entryId={e.id}
                  state={e.viewerTeamState}
                  open={jam.phase === 'open'}
                  viewerId={viewerId}
                  onChanged={() => void load()}
                />
              )}
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
