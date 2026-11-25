import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useSession } from '@/components/session/session-context';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { deleteMedStatsApi, putMedStatsApi, putMedStatsOnboardingApi } from '../../medschools.contract';
import { ME_KEY, statsQuery } from '../../medschools.queries';
import { parseStatsSearch } from '../../engine/search';
import { MedButton, medButtonClass } from '../controls/MedButton';
import { MedEmpty } from '../MedEmpty';
import { MedSignedOut } from '../MedSignedOut';
import { PageHead } from '../shell/PageHead';
import { SkeletonSwap } from '../skeletons';
import { bodyOf, draftOf, type DraftProblem, type StatsDraft } from './draft';
import {
  AboutSection,
  GpaSection,
  HoursSection,
  McatSection,
  STATS_STEPS,
  useStatsText,
  type SectionProps,
  type StatsStep,
} from './StatsSections';

function Section({ step, props }: { step: StatsStep; props: SectionProps }) {
  switch (step) {
    case 'mcat':
      return <McatSection {...props} />;
    case 'gpa':
      return <GpaSection {...props} />;
    case 'hours':
      return <HoursSection {...props} />;
    default:
      return <AboutSection {...props} />;
  }
}

/**
 * /med/stats ("My stats"): the member's own applicant stats (phase D). Every field is optional and private: never
 * shown to anyone else, never counted in a public figure, sent to the AI only when the member builds a list with "Use
 * my stats". Signed out it is the sign-in prompt and sends nothing. The whole form saves at once (one ink primary).
 * With `?welcome=1` it is the onboarding: the four sections as steps, Back, Next and "Skip for now".
 */
export function StatsPage() {
  const { t } = useTranslation('medschools');
  const { stepTitle } = useStatsText();
  const { data: session, isPending } = useSession();
  const signedIn = !!session;
  const qc = useQueryClient();
  const refusal = useRefusalText();
  const confirm = useConfirm();
  const welcome = parseStatsSearch(useSearch({ strict: false }) as Record<string, unknown>).welcome === '1';
  const stats = useQuery({ ...statsQuery(), enabled: signedIn });
  // The member's edits; until the first one, the form shows what is stored (no effect copies it across).
  const [edited, setDraft] = useState<StatsDraft | null>(null);
  const [problems, setProblems] = useState<Record<string, DraftProblem>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [step, setStep] = useState(0);
  /** The onboarding ended (saved or skipped): it shows where to go next instead of the steps. */
  const [finished, setFinished] = useState<'saved' | 'skipped' | null>(null);

  const draft = edited ?? (stats.data ? draftOf(stats.data.stats, stats.data.homeState) : null);

  const title = t('stats-title', { defaultValue: 'My stats' });
  const sub = (
    <>
      {t('stats-intro', { defaultValue: 'Add what you’re comfortable sharing. It’s private to you.' })}{' '}
      {t('stats-privacy', {
        defaultValue:
          'Never shown to anyone else or counted in any public figure. Sent to the AI only when you build a list with “Use my stats”.',
      })}
    </>
  );
  const expired = stats.error instanceof HttpError && stats.error.status === 401;
  if (!signedIn && isPending) {
    return (
      <>
        <PageHead title={title} />
        <SkeletonSwap ready={false}>{null}</SkeletonSwap>
      </>
    );
  }
  if (!signedIn || expired) {
    return (
      <>
        <PageHead title={title} />
        <MedSignedOut
          title={t('stats-signed-out-title', { defaultValue: 'Sign in to keep your stats' })}
          description={t('stats-signed-out-body', { defaultValue: 'Your stats are private to your account.' })}
          callbackURL="/med/stats"
        />
      </>
    );
  }

  const done = async () => {
    await qc.invalidateQueries({ queryKey: [...ME_KEY, 'stats'] });
  };
  const save = async () => {
    if (!draft) return;
    const r = bodyOf(draft);
    if ('problems' in r) {
      setProblems(r.problems);
      const first = Object.keys(r.problems)[0] ?? '';
      const at = STATS_STEPS.findIndex((s) => first.startsWith(s === 'about' ? 'count' : s));
      if (welcome && at >= 0) setStep(at);
      return;
    }
    setProblems({});
    setBusy(true);
    try {
      const res = await api(putMedStatsApi, { body: r.body });
      qc.setQueryData(statsQuery().queryKey, res);
      setDraft(draftOf(res.stats, res.homeState));
      setSaved(true);
      await qc.invalidateQueries({ queryKey: [...ME_KEY, 'prefs'] });
      if (welcome) setFinished('saved');
    } catch (e) {
      toast.error(refusal(e));
    } finally {
      setBusy(false);
    }
  };
  const skip = async () => {
    setBusy(true);
    try {
      qc.setQueryData(statsQuery().queryKey, await api(putMedStatsOnboardingApi, { body: { state: 'skipped' } }));
      setFinished('skipped');
    } catch (e) {
      toast.error(refusal(e));
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    const ok = await confirm({
      title: t('stats-clear-title', { defaultValue: 'Remove your stats?' }),
      description: t('stats-clear-body', {
        defaultValue: 'Every score, GPA, hour and note you entered is deleted. Your lists and tracker are not changed.',
      }),
      confirmLabel: t('stats-clear', { defaultValue: 'Remove my stats' }),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api(deleteMedStatsApi, {});
      qc.setQueryData(statsQuery().queryKey, res);
      setDraft(draftOf(res.stats, res.homeState));
      setSaved(false);
      await done();
    } catch (e) {
      toast.error(refusal(e));
    } finally {
      setBusy(false);
    }
  };

  const props = (d: StatsDraft): SectionProps => ({
    draft: d,
    problems,
    disabled: busy,
    onChange: (next) => {
      setSaved(false);
      setDraft(next);
    },
  });
  const current = STATS_STEPS[step] ?? 'mcat';
  const last = step === STATS_STEPS.length - 1;

  return (
    <>
      <PageHead title={title} sub={sub} />
      <SkeletonSwap ready={!!draft}>
        {welcome && finished ? (
          <MedEmpty
            title={
              finished === 'saved'
                ? t('stats-onboard-saved', { defaultValue: 'Your stats are saved.' })
                : t('stats-onboard-skipped', { defaultValue: 'Skipped. You can add them any time from My stats.' })
            }
            action={
              <>
                <Link to="/med/lists" className={medButtonClass('primary')}>
                  {t('stats-onboard-lists', { defaultValue: 'Go to my lists' })}
                </Link>
                <Link to="/med/lists/build" className={medButtonClass('secondary')}>
                  {t('stats-build', { defaultValue: 'Build a list with AI' })}
                </Link>
              </>
            }
          />
        ) : draft && welcome ? (
          <section className="medapp-panel medapp-panel--padded medapp-stats" aria-labelledby="stats-step-heading">
            <p className="medapp-meta" aria-live="polite">
              {t('stats-step-of', {
                defaultValue: 'Step {{n}} of {{total}}',
                n: String(step + 1),
                total: String(STATS_STEPS.length),
              })}
            </p>
            <h2 id="stats-step-heading" className="medapp-h2">
              {stepTitle(current)}
            </h2>
            <Section step={current} props={props(draft)} />
            <div className="medapp-actions medapp-stats__actions">
              {last ? (
                <MedButton variant="primary" loading={busy} onClick={() => void save()}>
                  {t('stats-save', { defaultValue: 'Save my stats' })}
                </MedButton>
              ) : (
                <MedButton variant="primary" disabled={busy} onClick={() => setStep(step + 1)}>
                  {t('stats-next', { defaultValue: 'Next' })}
                </MedButton>
              )}
              {step > 0 ? (
                <MedButton disabled={busy} onClick={() => setStep(step - 1)}>
                  {t('stats-back', { defaultValue: 'Back' })}
                </MedButton>
              ) : null}
              <MedButton variant="tertiary" disabled={busy} onClick={() => void skip()}>
                {t('stats-skip', { defaultValue: 'Skip for now' })}
              </MedButton>
            </div>
          </section>
        ) : draft ? (
          <div className="medapp-sections">
            {STATS_STEPS.map((s) => (
              <section
                key={s}
                className="medapp-panel medapp-panel--padded medapp-stats"
                aria-labelledby={`stats-${s}-heading`}
              >
                <h2 id={`stats-${s}-heading`} className="medapp-h2">
                  {stepTitle(s)}
                </h2>
                <Section step={s} props={props(draft)} />
              </section>
            ))}
            <div className="medapp-actions medapp-stats__actions">
              <MedButton variant="primary" loading={busy} onClick={() => void save()}>
                {t('stats-save', { defaultValue: 'Save my stats' })}
              </MedButton>
              <Link to="/med/lists/build" className={medButtonClass('secondary')}>
                {t('stats-build', { defaultValue: 'Build a list with AI' })}
              </Link>
              {stats.data?.stats ? (
                <MedButton variant="danger" disabled={busy} onClick={() => void clear()}>
                  {t('stats-clear', { defaultValue: 'Remove my stats' })}
                </MedButton>
              ) : null}
              {saved ? (
                <p className="medapp-meta" role="status">
                  {t('stats-saved', { defaultValue: 'Saved.' })}
                </p>
              ) : Object.keys(problems).length ? (
                <p className="medapp-meta medapp-stats__err" role="alert">
                  {t('stats-fix', { defaultValue: 'Some entries need a look before they can be saved.' })}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </SkeletonSwap>
    </>
  );
}
