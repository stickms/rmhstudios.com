import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useSession } from '@/components/session/session-context';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { cycleLabel, cycleYearOf } from '../../engine/cycle';
import { parseTrackerSearch } from '../../engine/search';
import { HOME_STATE_CODES, accountOldEnoughToShare, cycleYearProblem, type MilestoneType } from '../../engine/tracker';
import {
  addMedApplicationApi,
  deleteMedApplicationApi,
  deleteMedMilestoneApi,
  patchMedApplicationApi,
  putMedMilestoneApi,
  putMedTrackerCycleApi,
  type TrackerCycleDto,
  type TrackerDto,
} from '../../medschools.contract';
import { ME_KEY, trackerQuery } from '../../medschools.queries';
import { SkeletonSwap } from '../skeletons';
import { AddSchool } from './AddSchool';
import { ApplicationRow } from './ApplicationRow';
import { SharingRow } from './SharingRow';

/** The cycle years the tracker will create (D7): the window around the current cycle that the server accepts. */
function candidateCycles(now: Date, have: readonly number[]): number[] {
  const current = cycleYearOf(now, 'SECONDARY');
  const out: number[] = [];
  for (let y = current + 1; y >= current - 3; y--) if (!cycleYearProblem(y, now) && !have.includes(y)) out.push(y);
  return out;
}

/** Create a cycle: the year (defaulting to the current cycle), sharing off. */
function AddCycle({
  years,
  onAdd,
  onCancel,
}: {
  years: number[];
  onAdd: (year: number) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation('medschools');
  const refusal = useRefusalText();
  const current = cycleYearOf(new Date(), 'SECONDARY');
  const [year, setYear] = useState(years.includes(current) ? current : (years[0] ?? current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-b border-site-border py-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        onAdd(year).catch((err: unknown) => {
          setError(refusal(err));
          setBusy(false);
        });
      }}
    >
      <Select
        controlSize="sm"
        aria-label={t('tracker-cycle-new-label', { defaultValue: 'Cycle to add' })}
        value={String(year)}
        disabled={busy}
        onChange={(e) => setYear(Number(e.target.value))}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {cycleLabel(y)}
          </option>
        ))}
      </Select>
      <Button type="submit" loading={busy}>
        {t('tracker-cycle-create', { defaultValue: 'Create cycle' })}
      </Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
        {t('tracker-cancel', { defaultValue: 'Cancel' })}
      </Button>
      {error ? (
        <p className="t-meta m-0 w-full" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * /rmh-medschool/tracker: the member's private tracker. Signed out, the site's sign-in prompt and no request (a 401
 * after load, an expired session, turns into the same prompt: D17). Nothing here is optimistic: every change awaits the
 * server, refetches the tracker, and only then closes its form or moves its switch.
 */
export function TrackerPage() {
  const { t } = useTranslation('medschools');
  const { data: session, isPending } = useSession();
  const signedIn = !!session;
  const search = parseTrackerSearch(useSearch({ strict: false }) as Record<string, unknown>);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const refusal = useRefusalText();
  const query = useQuery({ ...trackerQuery(search.cycle), enabled: signedIn });
  const [adding, setAdding] = useState<'none' | 'cycle' | 'school'>('none');

  const title = t('tracker-title', { defaultValue: 'My tracker' });
  const breadcrumbs = [
    { label: t('index-title', { defaultValue: 'RMH Med Schools' }), to: '/rmh-medschool' },
    { label: title },
  ];

  const expired = query.error instanceof HttpError && query.error.status === 401;
  if (!signedIn && isPending) {
    return (
      <PageLayout title={title} breadcrumbs={breadcrumbs}>
        <SkeletonSwap ready={false}>{null}</SkeletonSwap>
      </PageLayout>
    );
  }
  if (!signedIn || expired) {
    return (
      <PageLayout title={title} breadcrumbs={breadcrumbs}>
        <SignedOutPrompt
          title={t('tracker-signed-out-title', { defaultValue: 'Sign in to track your cycle' })}
          description={t('tracker-signed-out-body', {
            defaultValue: 'Your tracker is private to your account. Sign in to keep your schools and dates.',
          })}
          callbackURL="/rmh-medschool/tracker"
        />
      </PageLayout>
    );
  }

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ME_KEY });
  };
  const data: TrackerDto | undefined = query.data;
  const cycle: TrackerCycleDto | null = data?.cycle ?? null;

  const putCycle = async (body: { cycleYear: number; homeState?: string | null; shareAnonymously: boolean }) => {
    await api(putMedTrackerCycleApi, { body });
    await refresh();
  };

  const createdAt = (session.user as { createdAt?: unknown } | undefined)?.createdAt;
  const created = createdAt ? new Date(createdAt as string | number | Date) : null;
  const accountTooNew = !!created && !Number.isNaN(created.getTime()) && !accountOldEnoughToShare(created);

  const body = (d: TrackerDto) => {
    const years = candidateCycles(new Date(), d.cycles);
    const addCycleForm =
      adding === 'cycle' ? (
        <AddCycle
          years={years}
          onAdd={async (year) => {
            await putCycle({ cycleYear: year, shareAnonymously: false });
            setAdding('none');
            await navigate({ to: '/rmh-medschool/tracker', search: { cycle: year }, replace: true });
          }}
          onCancel={() => setAdding('none')}
        />
      ) : null;

    if (!cycle) {
      return (
        <>
          <EmptyState
            title={t('tracker-no-cycle-title', { defaultValue: 'No cycle yet' })}
            description={t('tracker-no-cycle-body', {
              defaultValue: 'Add a cycle to start tracking schools and dates. Only you can see it.',
            })}
            action={
              <Button variant="primary" onClick={() => setAdding('cycle')}>
                {t('tracker-cycle-add', { defaultValue: 'Add cycle' })}
              </Button>
            }
          />
          {addCycleForm}
        </>
      );
    }

    return (
      <>
        <div className="flex flex-wrap items-center gap-2 border-b border-site-border pb-3">
          <Select
            controlSize="sm"
            aria-label={t('tracker-cycle-label', { defaultValue: 'Cycle' })}
            value={String(cycle.cycleYear)}
            onChange={(e) =>
              void navigate({ to: '/rmh-medschool/tracker', search: { cycle: Number(e.target.value) }, replace: true })
            }
          >
            {d.cycles.map((y) => (
              <option key={y} value={y}>
                {cycleLabel(y)}
              </option>
            ))}
          </Select>
          {years.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setAdding('cycle')}>
              {t('tracker-cycle-add', { defaultValue: 'Add cycle' })}
            </Button>
          ) : null}
          <label className="ms-auto flex items-center gap-2">
            <span className="t-label">{t('tracker-home-state', { defaultValue: 'Home state' })}</span>
            <Select
              controlSize="sm"
              aria-label={t('tracker-home-state', { defaultValue: 'Home state' })}
              value={cycle.homeState ?? ''}
              onChange={(e) =>
                void putCycle({
                  cycleYear: cycle.cycleYear,
                  homeState: e.target.value || null,
                  shareAnonymously: cycle.shareAnonymously,
                }).catch((err: unknown) => toast.error(refusal(err)))
              }
            >
              <option value="">{t('tracker-home-state-none', { defaultValue: 'Not set' })}</option>
              {HOME_STATE_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <p className="t-meta m-0 mt-2">
          {t('tracker-home-state-note', { defaultValue: 'Home state is used only for your own view. Never shared.' })}
        </p>
        {addCycleForm}

        <SharingRow
          checked={cycle.shareAnonymously}
          sharingAvailable={d.sharingAvailable}
          accountTooNew={accountTooNew}
          onToggle={(next) =>
            putCycle({
              cycleYear: cycle.cycleYear,
              shareAnonymously: next,
              ...(cycle.homeState !== null ? { homeState: cycle.homeState } : {}),
            })
          }
        />

        <div className="mt-6 flex items-center justify-between gap-3">
          <h2 className="t-heading m-0">{t('tracker-schools-heading', { defaultValue: 'Schools' })}</h2>
          <Button variant="primary" onClick={() => setAdding('school')}>
            {t('tracker-add-school', { defaultValue: 'Add school' })}
          </Button>
        </div>

        {adding === 'school' ? (
          <AddSchool
            onAdd={async (school, program) => {
              await api(addMedApplicationApi, {
                body: { cycleYear: cycle.cycleYear, schoolSlug: school.slug, program },
              });
              await refresh();
              setAdding('none');
            }}
            onCancel={() => setAdding('none')}
          />
        ) : null}

        {cycle.applications.length === 0 ? (
          <EmptyState
            title={t('tracker-no-schools-title', { defaultValue: 'No schools yet' })}
            description={t('tracker-no-schools-body', {
              defaultValue: 'Add the schools you applied to, then a date for each step as it happens.',
            })}
          />
        ) : (
          <ul className="m-0 mt-2 list-none border-t border-site-border p-0">
            {cycle.applications.map((app) => (
              <ApplicationRow
                key={app.id}
                app={app}
                cycleYear={cycle.cycleYear}
                sharing={cycle.shareAnonymously}
                onSaveMilestone={async (type: MilestoneType, date) => {
                  await api(putMedMilestoneApi, { params: { id: app.id, type }, body: { date } });
                  await refresh();
                }}
                onRemoveMilestone={async (type: MilestoneType) => {
                  await api(deleteMedMilestoneApi, { params: { id: app.id, type } });
                  await refresh();
                }}
                onSaveNotes={async (notes) => {
                  await api(patchMedApplicationApi, { params: { id: app.id }, body: { notes } });
                  await refresh();
                }}
                onRemove={async () => {
                  await api(deleteMedApplicationApi, { params: { id: app.id } });
                  await refresh();
                }}
              />
            ))}
          </ul>
        )}
      </>
    );
  };

  return (
    <PageLayout title={title} breadcrumbs={breadcrumbs}>
      {query.isError ? (
        <EmptyState
          title={t('tracker-load-failed', { defaultValue: 'Could not load your tracker.' })}
          action={<Button onClick={() => void query.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>}
        />
      ) : (
        <SkeletonSwap ready={!!data}>{data ? body(data) : null}</SkeletonSwap>
      )}
    </PageLayout>
  );
}
