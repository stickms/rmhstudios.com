import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart } from '@/components/ui/bar-chart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { getDeckPaceApi, setDeckPaceApi, type DeckPaceView } from '@/lib/study/pace.contract';
import { MAX_NEW_PER_DAY } from '@/lib/study/pace';
import { NEW_PER_SESSION } from '@/lib/study/queue';

function viewerTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * The deck page's "Pace" section (owner only): new cards a day, an optional test date with the pace it suggests,
 * and the next seven days. Opt-in: with no pace the deck keeps the per-session rule and says so.
 */
export function DeckPace({ deckId }: { deckId: string }) {
  const timeZone = viewerTimeZone();
  const query = useQuery({
    ...apiQuery(getDeckPaceApi, {
      params: { id: deckId },
      query: timeZone ? { tz: timeZone } : {},
    }),
    retry: false,
  });
  const arrival = useArrival(!!query.data);
  if (query.isError) return null;
  if (!query.data) return <Skeleton className="h-24 w-full" aria-busy />;
  return (
    <div className={arrival}>
      <PaceBody deckId={deckId} view={query.data} timeZone={timeZone} />
    </div>
  );
}

function PaceBody({ deckId, view, timeZone }: { deckId: string; view: DeckPaceView; timeZone: string | undefined }) {
  const { t, i18n } = useTranslation('study-pace');
  const queryClient = useQueryClient();
  const [perDay, setPerDay] = useState(view.newPerDay === null ? '' : String(view.newPerDay));
  const [testDate, setTestDate] = useState(view.testDate ?? '');
  const [busy, setBusy] = useState(false);
  const number = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const dayLabel = useMemo(() => {
    const f = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeZone: 'UTC' });
    return (day: string) => f.format(new Date(`${day}T00:00:00Z`));
  }, [i18n.language]);
  const shortDay = useMemo(() => {
    const f = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return (day: string) => f.format(new Date(`${day}T00:00:00Z`));
  }, [i18n.language]);

  async function save(body: { newPerDay?: number | null; testDate?: string | null }, done: string) {
    setBusy(true);
    try {
      const res = await api(setDeckPaceApi, {
        params: { id: deckId },
        body: { ...body, ...(timeZone ? { tz: timeZone } : {}) },
      });
      setPerDay(res.newPerDay === null ? '' : String(res.newPerDay));
      setTestDate(res.testDate ?? '');
      await queryClient.invalidateQueries({ queryKey: [getDeckPaceApi.path] });
      toast.success(done);
    } catch {
      toast.error(t('save-failed', { defaultValue: 'Could not save the pace' }));
    } finally {
      setBusy(false);
    }
  }

  const draft = perDay.trim() === '' ? null : Number(perDay);
  const draftValid = draft === null || (Number.isInteger(draft) && draft >= 0 && draft <= MAX_NEW_PER_DAY);
  const bars = view.forecast.map((f) => ({ label: shortDay(f.date), value: f.scheduled + f.fresh }));
  const forecastLabel = t('forecast-label', { defaultValue: 'Cards due' });
  const state = view.testState;

  return (
    <section className="space-y-3 border-b border-site-border pb-4" aria-labelledby={`pace-${deckId}`}>
      <h2 id={`pace-${deckId}`} className="t-heading">
        {t('heading', { defaultValue: 'Pace' })}
      </h2>

      <div className="space-y-1">
        <label htmlFor={`pace-per-day-${deckId}`} className="t-label block">
          {t('per-day-label', { defaultValue: 'New cards a day' })}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id={`pace-per-day-${deckId}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_NEW_PER_DAY}
            value={perDay}
            placeholder={t('per-day-placeholder', { defaultValue: 'No daily limit' })}
            aria-invalid={!draftValid}
            onChange={(e) => setPerDay(e.target.value)}
            className="max-w-40"
          />
          <Button
            variant="default"
            disabled={busy || !draftValid || draft === view.newPerDay}
            onClick={() =>
              void save(
                { newPerDay: draft },
                draft === null
                  ? t('saved-unpaced', { defaultValue: 'No daily limit' })
                  : t('saved-paced', {
                      count: draft,
                      defaultValue_one: '{{count}} new card a day',
                      defaultValue_other: '{{count}} new cards a day',
                    }),
              )
            }
          >
            {t('save-pace', { defaultValue: 'Save pace' })}
          </Button>
        </div>
        <p className="t-meta">
          {view.newPerDay === null
            ? t('unpaced-line', {
                count: NEW_PER_SESSION,
                defaultValue_one: 'No daily limit: each review session adds up to {{count}} new card across your decks',
                defaultValue_other:
                  'No daily limit: each review session adds up to {{count}} new cards across your decks',
              })
            : t('paced-line', {
                used: number.format(view.introducedToday),
                count: view.newPerDay + view.extraToday,
                defaultValue_one: '{{used}} of {{count}} new card used today',
                defaultValue_other: '{{used}} of {{count}} new cards used today',
              })}
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor={`pace-test-date-${deckId}`} className="t-label block">
          {t('test-date-label', { defaultValue: 'Test date' })}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id={`pace-test-date-${deckId}`}
            type="date"
            min={view.today}
            value={testDate}
            onChange={(e) => setTestDate(e.target.value)}
            className="max-w-44"
          />
          <Button
            variant="default"
            disabled={busy || testDate === '' || testDate === (view.testDate ?? '')}
            onClick={() => void save({ testDate }, t('saved-date', { defaultValue: 'Test date saved' }))}
          >
            {t('save-date', { defaultValue: 'Save date' })}
          </Button>
          {view.testDate && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void save({ testDate: null }, t('cleared-date', { defaultValue: 'Test date cleared' }))}
            >
              {t('clear-date', { defaultValue: 'Clear' })}
            </Button>
          )}
        </div>
        {view.testDate && state?.kind === 'upcoming' && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="t-body">
              {state.suggested === 0
                ? t('suggest-none', {
                    date: dayLabel(view.testDate),
                    defaultValue: 'You have already seen every card in this deck.',
                  })
                : t('suggest-line', {
                    date: dayLabel(view.testDate),
                    count: state.suggested,
                    defaultValue_one: 'To see every card by {{date}}, learn {{count}} a day',
                    defaultValue_other: 'To see every card by {{date}}, learn {{count}} a day',
                  })}
            </p>
            {state.suggested > 0 && state.suggested !== view.newPerDay && (
              <Button
                variant="default"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void save(
                    { newPerDay: state.suggested },
                    t('saved-paced', {
                      count: state.suggested,
                      defaultValue_one: '{{count}} new card a day',
                      defaultValue_other: '{{count}} new cards a day',
                    }),
                  )
                }
              >
                {t('use-pace', {
                  count: state.suggested,
                  defaultValue_one: 'Use {{count}} a day',
                  defaultValue_other: 'Use {{count}} a day',
                })}
              </Button>
            )}
          </div>
        )}
        {state?.kind === 'today' && <p className="t-body">{t('test-today', { defaultValue: 'The test is today.' })}</p>}
        {state?.kind === 'passed' && (
          <p className="t-body">{t('test-passed', { defaultValue: 'The test date has passed' })}</p>
        )}
      </div>

      <div className="space-y-1">
        <h3 className="t-label">{t('forecast-heading', { defaultValue: 'Next seven days' })}</h3>
        <BarChart
          label={forecastLabel}
          summary={t('forecast-summary', {
            label: forecastLabel,
            total: number.format(bars.reduce((a, b) => a + b.value, 0)),
            max: number.format(Math.max(0, ...bars.map((b) => b.value))),
            defaultValue: '{{label}}: {{total}} in total, up to {{max}} in one day.',
          })}
          columns={{
            label: t('table-day', { defaultValue: 'Day' }),
            value: t('table-value', { defaultValue: 'Cards' }),
          }}
          bars={bars}
        />
        <p className="t-meta">
          {view.newPerDay === null
            ? t('forecast-note-unpaced', {
                defaultValue: 'Scheduled cards only. Overdue cards count on today.',
              })
            : t('forecast-note-paced', {
                defaultValue: 'Scheduled cards plus the new cards your pace adds. Overdue cards count on today.',
              })}
        </p>
      </div>
    </section>
  );
}
