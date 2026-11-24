import { lazy, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { ArrivalSuspense } from '@/components/ui/arrive';
import { MedButton } from '../controls/MedButton';
import { MedSelect } from '../controls/MedSelect';
import { cn } from '@/lib/utils';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useSession } from '@/components/session/session-context';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { cycleLabelIsolated, cycleYearOf } from '../../engine/cycle';
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
import { ME_KEY, chancesQuery, trackerQuery } from '../../medschools.queries';
import { MedEmpty } from '../MedEmpty';
import { MedSignedOut } from '../MedSignedOut';
import { PageHead } from '../shell/PageHead';
import { RollingSection } from '../rolling/RollingSection';
import { OverlapSection } from '../secondaries/OverlapSection';
import { SkeletonSwap } from '../skeletons';
import { AddSchool } from './AddSchool';
import { ApplicationRow } from './ApplicationRow';
import { SharingRow } from './SharingRow';
import { Timeline } from './Timeline';

/** The import view is its own chunk: it loads when "Import from a file" is pressed, never with the tracker. */
const TrackerImport = lazy(() => import('./import/TrackerImport'));

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
  className,
}: {
  years: number[];
  onAdd: (year: number) => Promise<void>;
  onCancel: () => void;
  className?: string;
}) {
  const { t } = useTranslation('medschools');
  const refusal = useRefusalText();
  const current = cycleYearOf(new Date(), 'SECONDARY');
  const [year, setYear] = useState(years.includes(current) ? current : (years[0] ?? current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className={cn('medapp-form', className)}
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
      <label className="medapp-fieldset">
        <span className="medapp-label">{t('tracker-cycle-new-label', { defaultValue: 'Cycle to add' })}</span>
        <MedSelect
          aria-label={t('tracker-cycle-new-label', { defaultValue: 'Cycle to add' })}
          value={String(year)}
          disabled={busy}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {cycleLabelIsolated(y)}
            </option>
          ))}
        </MedSelect>
      </label>
      <div className="medapp-actions">
        <MedButton type="submit" loading={busy}>
          {t('tracker-cycle-create', { defaultValue: 'Create cycle' })}
        </MedButton>
        <MedButton type="button" variant="tertiary" disabled={busy} onClick={onCancel}>
          {t('tracker-cancel', { defaultValue: 'Cancel' })}
        </MedButton>
      </div>
      {error ? (
        <p className="medapp-meta basis-full" role="alert">
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
  // The estimate is an addition to the tracker: it asks only once the tracker has applications, and a failure leaves no
  // line and no banner (a 401 is the same session expiry the tracker itself handles).
  const trackerCycle = query.data?.cycle ?? null;
  const chancesOn = signedIn && !!trackerCycle && trackerCycle.applications.length > 0;
  const chances = useQuery({ ...chancesQuery({ cycle: trackerCycle?.cycleYear ?? 0 }), enabled: chancesOn });
  const [adding, setAdding] = useState<'none' | 'cycle' | 'school' | 'import'>('none');

  const head = <PageHead title={t('tracker-title', { defaultValue: 'My tracker' })} />;

  const expired = [query.error, chances.error].some((e) => e instanceof HttpError && e.status === 401);
  if (!signedIn && isPending) {
    return (
      <>
        {head}
        <SkeletonSwap ready={false}>{null}</SkeletonSwap>
      </>
    );
  }
  if (!signedIn || expired) {
    return (
      <>
        {head}
        <MedSignedOut
          title={t('tracker-signed-out-title', { defaultValue: 'Sign in to track your cycle' })}
          description={t('tracker-signed-out-body', {
            defaultValue: 'Your tracker is private to your account. Sign in to keep your schools and dates.',
          })}
          callbackURL="/rmh-medschool/tracker"
        />
      </>
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
    const addCycleForm = (className?: string) =>
      adding === 'cycle' ? (
        <AddCycle
          {...(className ? { className } : {})}
          years={years}
          onAdd={async (year) => {
            await putCycle({ cycleYear: year, shareAnonymously: false });
            setAdding('none');
            await navigate({
              to: '/rmh-medschool/tracker',
              search: { cycle: year },
              replace: true,
              resetScroll: false,
            });
          }}
          onCancel={() => setAdding('none')}
        />
      ) : null;

    // The import is the view while it is open: its "Add to my tracker" is the one ink primary on the page (R4).
    if (adding === 'import') {
      return (
        <ArrivalSuspense fallback={<SkeletonSwap ready={false}>{null}</SkeletonSwap>}>
          <TrackerImport
            cycleYear={cycle?.cycleYear ?? cycleYearOf(new Date(), 'SECONDARY')}
            onClose={() => setAdding('none')}
            onSaved={(year) => {
              setAdding('none');
              void navigate({
                to: '/rmh-medschool/tracker',
                search: { cycle: year },
                replace: true,
                resetScroll: false,
              });
            }}
          />
        </ArrivalSuspense>
      );
    }

    if (!cycle) {
      return (
        <>
          <MedEmpty
            title={t('tracker-no-cycle-title', { defaultValue: 'No cycle yet' })}
            description={t('tracker-no-cycle-body', {
              defaultValue: 'Add a cycle to start tracking schools and dates. Only you can see it.',
            })}
            action={
              adding === 'cycle' ? (
                addCycleForm('w-full text-start')
              ) : (
                <>
                  <MedButton variant="primary" onClick={() => setAdding('cycle')}>
                    {t('tracker-cycle-add', { defaultValue: 'Add cycle' })}
                  </MedButton>
                  <MedButton variant="tertiary" onClick={() => setAdding('import')}>
                    {t('import-open', { defaultValue: 'Import from a file' })}
                  </MedButton>
                </>
              )
            }
          />
        </>
      );
    }

    return (
      <div className="medapp-sections">
        <section className="medapp-section medapp-section--panel" aria-labelledby="med-cycle-heading">
          <h2 id="med-cycle-heading" className="medapp-h2">
            {t('tracker-cycle-heading', { defaultValue: 'This cycle' })}
          </h2>
          <div className="medapp-fields">
            <label className="medapp-fieldset">
              <span className="medapp-label">{t('tracker-cycle-label', { defaultValue: 'Cycle' })}</span>
              <span className="medapp-inline">
                <MedSelect
                  aria-label={t('tracker-cycle-label', { defaultValue: 'Cycle' })}
                  value={String(cycle.cycleYear)}
                  onChange={(e) =>
                    void navigate({
                      to: '/rmh-medschool/tracker',
                      search: { cycle: Number(e.target.value) },
                      replace: true,
                      resetScroll: false,
                    })
                  }
                >
                  {d.cycles.map((y) => (
                    <option key={y} value={y}>
                      {cycleLabelIsolated(y)}
                    </option>
                  ))}
                </MedSelect>
                {years.length > 0 ? (
                  <MedButton disabled={adding === 'cycle'} onClick={() => setAdding('cycle')}>
                    <Plus aria-hidden="true" className="size-4" />
                    {t('tracker-cycle-add', { defaultValue: 'Add cycle' })}
                  </MedButton>
                ) : null}
              </span>
            </label>
            <div className="medapp-fieldset">
              <label className="medapp-fieldset">
                <span className="medapp-label">{t('tracker-home-state', { defaultValue: 'Home state' })}</span>
                <MedSelect
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
                </MedSelect>
              </label>
              <p className="medapp-meta">
                {t('tracker-home-state-note', {
                  defaultValue: 'Home state is used only for your own view. Never shared.',
                })}
              </p>
            </div>
          </div>
          {addCycleForm('medapp-subrule')}
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
        </section>

        <section className="medapp-section" aria-labelledby="med-schools-heading">
          <div className="medapp-head flex-wrap">
            <h2 id="med-schools-heading" className="medapp-h2">
              {t('tracker-schools-heading', { defaultValue: 'Schools' })}
            </h2>
            <div className="medapp-actions">
              <MedButton variant="tertiary" onClick={() => setAdding('import')}>
                {t('import-open', { defaultValue: 'Import from a file' })}
              </MedButton>
              <MedButton variant="primary" onClick={() => setAdding('school')}>
                <Plus aria-hidden="true" className="size-4" />
                {t('tracker-add-school', { defaultValue: 'Add school' })}
              </MedButton>
            </div>
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

          <div>
            {cycle.applications.length === 0 ? (
              <MedEmpty
                title={t('tracker-no-schools-title', { defaultValue: 'No schools yet' })}
                description={t('tracker-no-schools-body', {
                  defaultValue: 'Add the schools you applied to, then a date for each step as it happens.',
                })}
              />
            ) : (
              <div className="medapp-panel">
                <ul className="medapp-rows">
                  {cycle.applications.map((app) => (
                    <ApplicationRow
                      key={app.id}
                      app={app}
                      cycleYear={cycle.cycleYear}
                      sharing={cycle.shareAnonymously}
                      chance={chances.data?.chances.find((c) => c.applicationId === app.id)}
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
              </div>
            )}
          </div>
        </section>
        {cycle.applications.length > 0 ? <Timeline applications={cycle.applications} /> : null}
        {/* the overlap reads the current cycle's schools, so it is offered on that cycle only */}
        {cycle.applications.length > 0 && cycle.cycleYear === cycleYearOf(new Date(), 'SECONDARY') ? (
          <div className="medapp-panel">
            <RollingSection source={{ source: 'tracker' }} />
            <OverlapSection source={{ source: 'tracker' }} />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <>
      {head}
      {query.isError ? (
        <MedEmpty
          title={t('tracker-load-failed', { defaultValue: 'Could not load your tracker.' })}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <SkeletonSwap ready={!!data} stale={query.isPlaceholderData}>
          {data ? body(data) : null}
        </SkeletonSwap>
      )}
    </>
  );
}
