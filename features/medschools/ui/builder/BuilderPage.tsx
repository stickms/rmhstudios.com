import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useArrival } from '@/components/ui/arrive';
import { useSession } from '@/components/session/session-context';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { saveMedBuiltListApi } from '../../medschools.contract';
import { ME_KEY, askStatusQuery, statsQuery } from '../../medschools.queries';
import { MedButton } from '../controls/MedButton';
import { MedInput, MedTextarea } from '../controls/MedField';
import { MedSwitch } from '../controls/MedSwitch';
import { MedEmpty } from '../MedEmpty';
import { MedSignedOut } from '../MedSignedOut';
import { PageHead } from '../shell/PageHead';
import { OnboardingNote } from '../stats/OnboardingNote';
import { BuildResult } from './BuildResult';
import { useBuild } from './useBuild';

export const REQUEST_MAX = 400;
const iso = (n: number) => `⁨${n}⁩`;

/** The name a saved list starts with: the request's first words, at most 60 characters. */
export function defaultListName(request: string): string {
  const one = request.trim().replace(/\s+/g, ' ');
  return one.length <= 60 ? one : `${one.slice(0, 57).trimEnd()}…`;
}

/**
 * /med/lists/build: the AI school-list builder (phase D). The member asks in words and may tick "Use my stats"; the
 * result is grouped by the label code computed, each school with its comparison and cited figures. Nothing is stored
 * unless the member presses "Save as a list" (which becomes the one ink primary once there is a result). Signed out it
 * is the sign-in prompt and sends nothing.
 */
export function BuilderPage() {
  const { t } = useTranslation('medschools');
  const { data: session, isPending } = useSession();
  const signedIn = !!session;
  const qc = useQueryClient();
  const refusal = useRefusalText();
  const id = useId();
  const status = useQuery({ ...askStatusQuery(), enabled: signedIn });
  const stats = useQuery({ ...statsQuery(), enabled: signedIn });
  const [request, setRequest] = useState('');
  const [useStats, setUseStats] = useState(true);
  const [think, setThink] = useState(false);
  const { run, build: start, cancel } = useBuild();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedList, setSavedList] = useState<string | null>(null);
  const arrival = useArrival(run.state === 'done');

  const title = t('builder-title', { defaultValue: 'Build a list' });
  if (!signedIn) {
    if (isPending) return <PageHead title={title} />;
    return (
      <>
        <PageHead title={title} />
        <MedSignedOut
          title={t('builder-signed-out-title', { defaultValue: 'Sign in to build a list' })}
          description={t('builder-signed-out-body', { defaultValue: 'Lists you save are private to your account.' })}
          callbackURL="/med/lists/build"
        />
      </>
    );
  }

  const hasStats = !!stats.data?.stats && (stats.data.stats.mcat.length > 0 || stats.data.stats.gpa.cumulative !== null);
  const thinkingAvailable = status.data?.thinkingAvailable === true;
  const configured = status.data?.configured ?? true;
  const remaining = status.data?.remainingToday ?? null;
  const cap = status.data?.dailyCap ?? null;
  const pending = run.state === 'pending';
  const canBuild = configured && remaining !== 0 && request.trim().length >= 3 && !pending;
  const result = run.state === 'done' ? run.res : null;

  const build = async () => {
    setSavedList(null);
    const res = await start({ request: request.trim(), useStats, think: thinkingAvailable && think });
    if (!res) return;
    setSelected(new Set(res.schools.map((s) => s.slug)));
    setName(defaultListName(request));
  };
  const save = async () => {
    if (!result) return;
    const items = result.schools.filter((s) => selected.has(s.slug)).map((s) => ({ slug: s.slug, program: s.program }));
    if (items.length === 0 || !name.trim()) return;
    setSaving(true);
    try {
      const list = await api(saveMedBuiltListApi, { body: { name: name.trim(), items } });
      setSavedList(list.name);
      await qc.invalidateQueries({ queryKey: [...ME_KEY, 'lists'] });
    } catch (e) {
      toast.error(refusal(e));
    } finally {
      setSaving(false);
    }
  };

  const ticked = result ? result.schools.filter((s) => selected.has(s.slug)).length : 0;

  return (
    <>
      <PageHead
        title={title}
        sub={t('builder-intro', {
          defaultValue:
            'Describe the schools you want. Labels compare your MCAT and GPA with each class’s published figures only. They are not a chance of admission.',
        })}
      />
      <OnboardingNote signedIn={signedIn} />
      <section className="medapp-panel medapp-panel--padded medapp-build__form" aria-label={title}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canBuild) void build();
          }}
        >
          <label htmlFor={`${id}-request`} className="medapp-label">
            {t('builder-request-label', { defaultValue: 'What are you looking for?' })}
          </label>
          <MedTextarea
            id={`${id}-request`}
            rows={3}
            maxLength={REQUEST_MAX}
            value={request}
            disabled={pending}
            placeholder={t('builder-request-placeholder', {
              defaultValue: '20 schools in the Northeast, research-heavy. I’m a Texas resident.',
            })}
            onChange={(e) => setRequest(e.target.value)}
          />
          <div className="flex items-start gap-3">
            <MedSwitch
              id={`${id}-stats`}
              checked={useStats}
              onCheckedChange={setUseStats}
              disabled={pending}
              aria-labelledby={`${id}-stats-label`}
              aria-describedby={`${id}-stats-help`}
            />
            <div className="flex min-w-0 flex-col">
              <span id={`${id}-stats-label`} className="medapp-label">
                {t('builder-use-stats', { defaultValue: 'Use my stats' })}
              </span>
              <span id={`${id}-stats-help`} className="medapp-meta">
                {hasStats
                  ? t('builder-use-stats-help', {
                      defaultValue: 'Sends your latest MCAT total, GPAs, hours and home state to the AI for this list only.',
                    })
                  : t('builder-use-stats-none', { defaultValue: 'You have no MCAT or GPA saved yet.' })}{' '}
                <Link to="/med/stats" className="medapp-link">
                  {hasStats
                    ? t('builder-edit-stats', { defaultValue: 'Edit my stats' })
                    : t('builder-add-stats', { defaultValue: 'Add your stats' })}
                </Link>
              </span>
            </div>
          </div>
          {thinkingAvailable ? (
            <div className="flex items-start gap-3">
              <MedSwitch
                id={`${id}-think`}
                checked={think}
                onCheckedChange={setThink}
                disabled={pending}
                aria-labelledby={`${id}-think-label`}
              />
              <span id={`${id}-think-label`} className="medapp-label">
                {t('ask-think-label', { defaultValue: 'Think it through' })}
              </span>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <MedButton
              type="submit"
              variant={result ? 'secondary' : 'primary'}
              loading={pending}
              disabled={!canBuild && !pending}
            >
              {result
                ? t('builder-rebuild', { defaultValue: 'Build again' })
                : t('builder-submit', { defaultValue: 'Build list' })}
            </MedButton>
            {pending ? (
              <MedButton variant="tertiary" onClick={cancel}>
                {t('ask-cancel', { defaultValue: 'Cancel' })}
              </MedButton>
            ) : null}
            <p className="medapp-meta ms-auto">
              {status.data?.tier === 'admin'
                ? t('ask-admin-unlimited', { defaultValue: 'Admin: no daily limit' })
                : remaining !== null && cap !== null
                  ? t('ask-remaining', {
                      defaultValue: '{{n}} of {{cap}} questions left today',
                      n: iso(remaining),
                      cap: iso(cap),
                    })
                  : null}
            </p>
          </div>
          <p className="medapp-meta">
            {t('builder-provider-note', {
              defaultValue: 'Your request goes to an AI provider to build the list. Nothing is kept unless you save it.',
            })}
          </p>
        </form>
      </section>

      {run.state === 'pending' ? (
        <p className="medapp-meta" role="status" aria-busy="true">
          {t('builder-pending', { defaultValue: 'Choosing schools from the published data. This takes a few seconds.' })}
        </p>
      ) : null}
      {run.state === 'error' ? (
        <p className="medapp-text" role="alert">
          {refusal(run.error)}
        </p>
      ) : null}
      {result ? (
        <div className={arrival}>
          {result.status === 'declined' || result.status === 'no-candidates' || result.status === 'no-picks' ? (
            <MedEmpty
              title={
                result.status === 'declined'
                  ? t('builder-declined', { defaultValue: 'That does not look like a request for a school list.' })
                  : result.status === 'no-candidates'
                    ? t('builder-no-candidates', { defaultValue: 'No school matches all of that.' })
                    : t('builder-no-picks', { defaultValue: 'No schools could be chosen from the data.' })
              }
              description={t('builder-try-again', { defaultValue: 'Try fewer limits or other words.' })}
            />
          ) : (
            <section className="medapp-panel medapp-panel--padded" aria-label={t('builder-result', { defaultValue: 'Suggested schools' })}>
              <BuildResult
                res={result}
                selected={selected}
                onToggle={(slug, on) => {
                  setSavedList(null);
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(slug);
                    else next.delete(slug);
                    return next;
                  });
                }}
              />
              <form
                className="medapp-form medapp-subrule"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <div className="medapp-fieldset">
                  <label className="medapp-label" htmlFor={`${id}-name`}>
                    {t('builder-list-name', { defaultValue: 'List name' })}
                  </label>
                  <MedInput
                    id={`${id}-name`}
                    maxLength={60}
                    value={name}
                    disabled={saving}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="medapp-actions">
                  <MedButton type="submit" variant="primary" loading={saving} disabled={ticked === 0 || !name.trim()}>
                    {t('builder-save', { defaultValue: 'Save as a list' })}
                  </MedButton>
                </div>
              </form>
              <p className="medapp-meta" role="status">
                {savedList ? (
                  <>
                    {t('builder-saved', { defaultValue: 'Saved as “{{name}}”.', name: savedList })}{' '}
                    <Link to="/med/lists" className="medapp-link">
                      {t('builder-open-lists', { defaultValue: 'Open my lists' })}
                    </Link>
                  </>
                ) : (
                  t('builder-ticked', {
                    defaultValue: '{{n}} of {{total}} schools ticked. Nothing is kept unless you save.',
                    n: iso(ticked),
                    total: iso(result.schools.length),
                  })
                )}
              </p>
            </section>
          )}
        </div>
      ) : null}
    </>
  );
}
