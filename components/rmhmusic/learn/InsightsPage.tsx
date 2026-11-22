/**
 * InsightsPage — `/rmhmusic/insights`: what the learner's stored cards say. How many items of each
 * drill (staff reading, ear training, Sprint) are due now, tonight and this week; the notes, intervals
 * and chords they are least likely to recall right now, each with a percentage; the ones that have
 * held up longest; a "Drill my weak spots" button into Practice; and the two settings on how cards are
 * scheduled (`PracticeSettings`).
 *
 * The numbers are `srs/insights.ts`; this file only lays them out. Each section has a fixed-height
 * skeleton while the cards load, so nothing moves when they arrive, and a new learner with nothing
 * answered yet gets one honest sentence instead of empty lists.
 */
import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useArrival } from '@/components/ui/arrive';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import {
  FAMILIES,
  buildInsights,
  describeItem,
  recallPercent,
  type Insights,
  type Strength,
} from '@/lib/rmhmusic/learn/srs/insights';
import type { ItemFamily } from '@/lib/rmhmusic/learn/srs/items';
import { PRIMARY_BUTTON, TEXT_BUTTON } from './buttons';
import { CardsGateNotice, useCardsGate } from './CardsGate';
import { itemName } from './item-names';
import { Shell } from './LessonScreen';
import { PracticeSettings } from './PracticeSettings';

type T = TFunction<'c-rmhmusic'>;

const HEADING = 'rmm-display text-2xl leading-8 text-app-text';
const ROW = 'flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2';

function familyName(t: T, family: ItemFamily): string {
  switch (family) {
    case 'staff':
      return t('insights-family-staff', { defaultValue: 'Reading notes' });
    case 'interval':
      return t('insights-family-interval', { defaultValue: 'Reading intervals' });
    case 'ear':
      return t('insights-family-ear', { defaultValue: 'Ear training' });
    case 'sprint':
      return t('insights-family-sprint', { defaultValue: 'Sprint' });
  }
}

function labelOf(t: T, cardId: string): string {
  const label = describeItem(cardId);
  return label === null ? cardId : itemName(t, label);
}

/** The placeholder: the same three sheets, each as tall as its loaded content's minimum. */
function InsightsSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-6">
      <div className="rmm-sheet h-52 p-4">
        <div className="app-skeleton h-6 w-24" />
      </div>
      <div className="rmm-sheet h-40 p-4">
        <div className="app-skeleton h-6 w-32" />
      </div>
      <div className="rmm-sheet h-44 p-4">
        <div className="app-skeleton h-6 w-40" />
      </div>
    </div>
  );
}

function StrengthList({ t, items, detail }: { t: T; items: readonly Strength[]; detail: (s: Strength) => string }) {
  return (
    <ul className="divide-y divide-app-border">
      {items.map((s) => (
        <li key={s.cardId} className={ROW}>
          <span className="text-app-text">{labelOf(t, s.cardId)}</span>
          <span className="text-sm text-app-text-muted">{detail(s)}</span>
        </li>
      ))}
    </ul>
  );
}

function Loaded({ insights }: { insights: Insights }) {
  const { t } = useTranslation('c-rmhmusic');
  const recall = (s: Strength) =>
    t('insights-recall', { value: recallPercent(s.recall), defaultValue: '{{value}}% likely to recall now' });
  const holds = (s: Strength) => {
    const days = Math.max(1, Math.round(s.stability));
    return days === 1
      ? t('insights-holds-one', { defaultValue: 'holds for about a day' })
      : t('insights-holds', {
          days,
          count: Number(days),
          defaultValue_one: 'holds for about {{days}} day',
          defaultValue: 'holds for about {{days}} days',
        });
  };
  const hasWeak = FAMILIES.some((f) => insights.weakest[f].length > 0);
  const hasStrong = FAMILIES.some((f) => insights.strongest[f].length > 0);
  return (
    <div className="space-y-6">
      {insights.reviewed === 0 ? (
        <section className="rmm-sheet space-y-3 p-5">
          <p className="text-app-text-muted">
            {t('insights-empty', {
              defaultValue:
                'Nothing to show yet. Answer a few cards in Practice, and your strong and weak notes appear here.',
            })}
          </p>
          <Link to="/rmhmusic/practice" className={PRIMARY_BUTTON}>
            {t('practice', { defaultValue: 'Practice' })}
          </Link>
        </section>
      ) : (
        <>
          <section aria-labelledby="insights-due" className="space-y-2">
            <h2 id="insights-due" className={HEADING}>
              {t('insights-due', { defaultValue: 'Due' })}
            </h2>
            <ul className="rmm-sheet divide-y divide-app-border">
              {FAMILIES.map((f) => {
                const c = insights.families[f];
                return (
                  <li key={f} className={ROW}>
                    <span className="text-app-text">{familyName(t, f)}</span>
                    <span className="text-sm text-app-text-muted">
                      {c.reviewed === 0
                        ? t('insights-none-yet', { defaultValue: 'Nothing answered yet' })
                        : t('insights-due-line', {
                            now: c.dueNow,
                            today: c.dueToday,
                            week: c.dueWeek,
                            defaultValue: '{{now}} due now · {{today}} by tonight · {{week}} this week',
                          })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {hasWeak ? (
            <section aria-labelledby="insights-weak" className="space-y-2">
              <h2 id="insights-weak" className={HEADING}>
                {t('insights-weak', { defaultValue: 'Weak spots' })}
              </h2>
              <div className="rmm-sheet divide-y divide-app-border">
                {FAMILIES.filter((f) => insights.weakest[f].length > 0).map((f) => (
                  <div key={f}>
                    <p className="px-4 pt-3 text-sm font-medium text-app-text-muted">{familyName(t, f)}</p>
                    <StrengthList t={t} items={insights.weakest[f]} detail={recall} />
                  </div>
                ))}
              </div>
              {insights.weakest.staff.length > 0 ? (
                <div className="pt-1">
                  <Link to="/rmhmusic/practice" search={{ weak: true }} className={PRIMARY_BUTTON}>
                    {t('insights-drill', { defaultValue: 'Drill my weak spots' })}
                  </Link>
                </div>
              ) : null}
            </section>
          ) : null}

          {hasStrong ? (
            <section aria-labelledby="insights-strong" className="space-y-2">
              <h2 id="insights-strong" className={HEADING}>
                {t('insights-strong', { defaultValue: 'Going strong' })}
              </h2>
              <div className="rmm-sheet divide-y divide-app-border">
                {FAMILIES.filter((f) => insights.strongest[f].length > 0).map((f) => (
                  <div key={f}>
                    <p className="px-4 pt-3 text-sm font-medium text-app-text-muted">{familyName(t, f)}</p>
                    <StrengthList t={t} items={insights.strongest[f].slice(0, 3)} detail={holds} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <section aria-labelledby="insights-settings" className="space-y-2">
        <h2 id="insights-settings" className={HEADING}>
          {t('insights-settings', { defaultValue: 'Practice settings' })}
        </h2>
        <div className="rmm-sheet p-4">
          <PracticeSettings />
        </div>
      </section>

      <Link to="/rmhmusic/today" className={TEXT_BUTTON}>
        {t('insights-to-today', { defaultValue: "See what's due today" })}
      </Link>
    </div>
  );
}

export function InsightsPage() {
  const { t } = useTranslation('c-rmhmusic');
  const gate = useCardsGate();
  const cards = useLearnStore((s) => s.cards);
  const ready = gate === 'ready';
  // The clock is read when the cards change, not on every render: the figures describe the moment they loaded.
  const insights = useMemo(() => (ready ? buildInsights(cards, Date.now()) : null), [cards, ready]);
  const arrival = useArrival(ready);
  return (
    <Shell title={t('insights-title', { defaultValue: 'Insights' })} busy={gate === 'loading'}>
      <CardsGateNotice state={gate} returnTo="/rmhmusic/insights" />
      {gate === 'loading' ? <InsightsSkeleton /> : null}
      {insights ? (
        <div className={arrival}>
          <Loaded insights={insights} />
        </div>
      ) : null}
    </Shell>
  );
}
