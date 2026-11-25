/**
 * RMHType challenges (s11-12): the ones you received (race or decline), the ones you sent (waiting, racing) and the
 * last 50 settled, with the switch that turns challenges off. App tier: RMHType keeps its own look. The `/rmhtype`
 * layout gates on sign-in.
 *
 * Names are member text: each sits where a sentence needs it isolated (`isolate`), and every block of rows carries
 * `dir="auto"`. A race is one attempt, so "Race" asks first: leaving it or reloading counts as did not finish.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { ChallengeDialog } from '@/components/rmhtype/ChallengeDialog';
import RmhTypeHeader from '@/components/rmhtype/RmhTypeHeader';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { toast } from '@/lib/toast';
import { isolate, resultFor, type ChallengeResult, type ChallengeRow } from '@/lib/rmhtype/challenges';
import {
  RMHTYPE_CHALLENGES_KEY,
  declineRmhTypeChallenge,
  rmhTypeChallengesQuery,
  setRmhTypeChallengesEnabled,
} from '@/lib/rmhtype/rmhtype.queries';

const wpm = (n: number) => Math.round(n);

function Figures({ row }: { row: ChallengeRow }) {
  const { t } = useTranslation('type-challenges');
  const mine = row.role === 'challenger' ? row.challengerWpm : row.opponentWpm;
  const theirs = row.role === 'challenger' ? row.opponentWpm : row.challengerWpm;
  return (
    <p className="t-meta flex flex-wrap gap-x-4 gap-y-1">
      <span>{t('figure-passage', { defaultValue: "'{{title}}'", title: row.title })}</span>
      {mine !== null && theirs !== null ? (
        <span>
          {t('figure-versus', { defaultValue: '{{mine}} vs {{theirs}} WPM', mine: wpm(mine), theirs: wpm(theirs) })}
        </span>
      ) : (
        <span>{t('figure-best', { defaultValue: 'To beat: {{wpm}} WPM', wpm: wpm(row.challengerWpm) })}</span>
      )}
    </p>
  );
}

/** The reader's side of a settled challenge, in a sentence. Literal keys, so the extractor sees each. */
function resultSentence(t: ReturnType<typeof useTranslation>['t'], result: ChallengeResult, other: string): string {
  const name = isolate(other);
  switch (result) {
    case 'won':
      return t('result-won', { defaultValue: 'You beat {{name}}', name });
    case 'lost':
      return t('result-lost', { defaultValue: 'You lost to {{name}}', name });
    case 'drew':
      return t('result-drew', { defaultValue: 'You drew with {{name}}', name });
    case 'unfinished':
      return t('result-unfinished', { defaultValue: 'You did not finish against {{name}}', name });
    default:
      return t('result-forfeited', { defaultValue: '{{name}} did not finish', name });
  }
}

export default function ChallengesPage() {
  const { t } = useTranslation('type-challenges');
  const refusalText = useRefusalText();
  const confirm = useConfirm();
  const router = useRouter();
  const qc = useQueryClient();
  const fmt = useLocaleFormat();
  const [dialogOpen, setDialogOpen] = useState(false);
  const query = useQuery({ ...rmhTypeChallengesQuery(), retry: false });
  const view = query.data;
  const arrival = useArrival(view !== undefined);
  const refresh = () => qc.invalidateQueries({ queryKey: RMHTYPE_CHALLENGES_KEY });

  const decline = useMutation({
    mutationFn: (id: string) => declineRmhTypeChallenge(id),
    onSuccess: () => void refresh(),
    onError: (err) =>
      toast.error(refusalText.maybe(err) ?? t('decline-failed', { defaultValue: 'Could not decline the challenge' })),
  });
  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) => setRmhTypeChallengesEnabled(enabled),
    onSuccess: () => void refresh(),
    onError: () => toast.error(t('switch-failed', { defaultValue: 'Could not change that setting' })),
  });

  async function race(row: ChallengeRow) {
    const ok = await confirm({
      title: t('race-title', { defaultValue: 'Race this run?' }),
      description: t('race-body', {
        defaultValue: 'You get one attempt. Leaving the race or reloading the page counts as did not finish.',
      }),
      confirmLabel: t('race', { defaultValue: 'Race' }),
    });
    if (ok) void router.navigate({ to: '/rmhtype/solo', search: { challenge: row.id } });
  }

  return (
    <div className="app-page">
      <RmhTypeHeader backLabel="RMH Type" backHref="/rmhtype" />
      <div className="mx-auto w-full max-w-4xl flex-1 p-4 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold" style={{ fontFamily: 'var(--app-font-display)' }}>
              {t('title', { defaultValue: 'Challenges' })}
            </h1>
            <p className="mt-2 max-w-xl text-app-text-muted">
              {t('intro', {
                defaultValue:
                  'Race a friend’s best run on a passage, or send yours. Only friends who follow each other can challenge one another.',
              })}
            </p>
          </div>
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            {t('challenge-someone', { defaultValue: 'Challenge someone' })}
          </Button>
        </div>

        {query.isError ? (
          <div className="mt-8" role="alert">
            <p className="text-app-danger">{t('load-failed', { defaultValue: 'Could not load your challenges.' })}</p>
            <button type="button" className="mt-2 underline hover:text-app-text" onClick={() => void query.refetch()}>
              {t('retry', { defaultValue: 'Try again' })}
            </button>
          </div>
        ) : !view ? (
          <div
            className="mt-8 space-y-4"
            role="status"
            aria-label={t('loading', { defaultValue: 'Loading your challenges' })}
          >
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className={arrival}>
            <section className="mt-8 flex items-center justify-between gap-4 border-t border-app-border pt-6">
              <div>
                <label id="challenges-switch-label" className="block text-sm font-medium">
                  {t('switch-label', { defaultValue: 'Accept challenges' })}
                </label>
                <p id="challenges-switch-hint" className="mt-1 text-xs text-app-text-muted">
                  {t('switch-hint', {
                    defaultValue: 'When this is off, nobody can send you a challenge. Ones already sent stay.',
                  })}
                </p>
              </div>
              <Switch
                checked={view.enabled}
                onCheckedChange={(on) => setEnabled.mutate(on)}
                disabled={setEnabled.isPending}
                aria-labelledby="challenges-switch-label"
                aria-describedby="challenges-switch-hint"
              />
            </section>

            <section className="mt-10 border-t border-app-border pt-6" aria-labelledby="received-heading" dir="auto">
              <h2 id="received-heading" className="t-heading mb-3">
                {t('received-title', { defaultValue: 'Received' })}
              </h2>
              {view.received.length === 0 ? (
                <p className="text-app-text-muted">
                  {t('received-empty', { defaultValue: 'Nobody has challenged you right now.' })}
                </p>
              ) : (
                <ul className="border-t border-app-border">
                  {view.received.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {t('received-row', {
                            defaultValue: '{{name}} challenged you',
                            name: isolate(row.challenger.name),
                          })}
                        </p>
                        <Figures row={row} />
                        <p className="t-meta">
                          {row.status === 'racing'
                            ? t('racing', { defaultValue: 'Race in progress' })
                            : t('expires', {
                                defaultValue: 'Expires {{date}}',
                                date: fmt.date(new Date(row.expiresAt), { dateStyle: 'medium' }),
                              })}
                        </p>
                      </div>
                      {row.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button onClick={() => void race(row)}>{t('race', { defaultValue: 'Race' })}</Button>
                          <Button onClick={() => decline.mutate(row.id)} disabled={decline.isPending}>
                            {t('decline', { defaultValue: 'Decline' })}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-10 border-t border-app-border pt-6" aria-labelledby="sent-heading" dir="auto">
              <h2 id="sent-heading" className="t-heading mb-3">
                {t('sent-title', { defaultValue: 'Sent' })}
              </h2>
              {view.sent.length === 0 ? (
                <p className="text-app-text-muted">
                  {t('sent-empty', { defaultValue: 'You have no challenges waiting.' })}
                </p>
              ) : (
                <ul className="border-t border-app-border">
                  {view.sent.map((row) => (
                    <li key={row.id} className="border-b border-app-border py-3">
                      <p className="font-medium">
                        {row.status === 'racing'
                          ? t('sent-racing', {
                              defaultValue: '{{name}} is racing you',
                              name: isolate(row.opponent.name),
                            })
                          : t('sent-waiting', {
                              defaultValue: 'Waiting for {{name}}',
                              name: isolate(row.opponent.name),
                            })}
                      </p>
                      <Figures row={row} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-10 border-t border-app-border pt-6" aria-labelledby="settled-heading" dir="auto">
              <h2 id="settled-heading" className="t-heading mb-3">
                {t('settled-title', { defaultValue: 'Settled' })}
              </h2>
              {view.settled.length === 0 ? (
                <p className="text-app-text-muted">{t('settled-empty', { defaultValue: 'No finished races yet.' })}</p>
              ) : (
                <ul className="border-t border-app-border">
                  {view.settled.map((row) => {
                    const other = row.role === 'challenger' ? row.opponent : row.challenger;
                    const result = resultFor(row.role, row.outcome ?? 'challenger', row.finished ?? false);
                    return (
                      <li key={row.id} className="border-b border-app-border py-3">
                        <p className="font-medium">{resultSentence(t, result, other.name)}</p>
                        <Figures row={row} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
      <ChallengeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
