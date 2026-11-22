/**
 * TodayPage — `/rmhmusic/today`: one place that says what is waiting. A row each for reading notes,
 * ear training and Sprint, with how many items are due now and one action that opens the drill that
 * will deal them first (Practice for staff cards; the ear lesson whose answers hold the most due items;
 * Sprint freeplay, whose prompts are dealt due and weak items first). Reading notes also says how many
 * new cards Practice may still add today (`PracticeSettings` sets the allowance).
 *
 * Exactly one action is the filled button: the first row with something to do. The numbers are
 * `content/today.ts`; nothing here writes.
 */
import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useArrival } from '@/components/ui/arrive';
import { getLesson } from '@/lib/rmhmusic/learn/content/path';
import { practiceAvailable } from '@/lib/rmhmusic/learn/content/practice';
import { buildToday, type TodayData } from '@/lib/rmhmusic/learn/content/today';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { DEFAULT_NEW_PER_DAY } from '@/lib/rmhmusic/learn/srs/practice-settings';
import type { ItemFamily } from '@/lib/rmhmusic/learn/srs/items';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_BUTTON } from './buttons';
import { CardsGateNotice, useCardsGate } from './CardsGate';
import { Shell } from './LessonScreen';
import { levelName } from './sprint/sprint-text';

type T = TFunction<'c-rmhmusic'>;

const ROW = 'flex min-h-20 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3';

interface Row {
  family: ItemFamily;
  name: string;
  /** What is waiting, in a sentence or two. */
  lines: string[];
  /** The action, or null when there is nothing to do here. */
  action: RowAction | null;
}

/** An action as data, so the page can make exactly one of them the filled button. */
type RowAction =
  | { to: '/rmhmusic/practice'; label: string }
  | { to: '/rmhmusic/lesson/$lessonId'; params: { lessonId: string }; label: string }
  | { to: '/rmhmusic/sprint'; label: string };

function rows(t: T, today: TodayData, staffReady: boolean): Row[] {
  const staffLines: string[] = [];
  if (today.due.staff > 0) staffLines.push(t('today-due', { n: today.due.staff, defaultValue: 'Due now: {{n}}' }));
  if (today.newPerDay > 0) {
    staffLines.push(t('today-new-left', { n: today.newLeft, defaultValue: 'New cards left today: {{n}}' }));
  }
  if (staffLines.length === 0) staffLines.push(t('today-none', { defaultValue: 'Nothing due.' }));

  const earLines: string[] = [];
  let earAction: Row['action'] = null;
  if (today.ear) {
    earLines.push(t('today-due', { n: today.due.ear, defaultValue: 'Due now: {{n}}' }));
    const title = getLesson(today.ear.lessonId)?.title ?? today.ear.lessonId;
    earLines.push(t('today-most-in-lesson', { where: title, defaultValue: 'Most in “{{where}}”.' }));
    earAction = {
      to: '/rmhmusic/lesson/$lessonId',
      params: { lessonId: today.ear.lessonId },
      label: t('today-start-lesson', { defaultValue: 'Start the lesson' }),
    };
  } else {
    earLines.push(t('today-none', { defaultValue: 'Nothing due.' }));
  }

  const intervalLines: string[] = [];
  let intervalAction: Row['action'] = null;
  if (today.interval) {
    intervalLines.push(t('today-due', { n: today.due.interval, defaultValue: 'Due now: {{n}}' }));
    const title = getLesson(today.interval.lessonId)?.title ?? today.interval.lessonId;
    intervalLines.push(t('today-most-in-lesson', { where: title, defaultValue: 'Most in “{{where}}”.' }));
    intervalAction = {
      to: '/rmhmusic/lesson/$lessonId',
      params: { lessonId: today.interval.lessonId },
      label: t('today-start-lesson', { defaultValue: 'Start the lesson' }),
    };
  } else {
    intervalLines.push(t('today-none', { defaultValue: 'Nothing due.' }));
  }

  const sprintLines: string[] = [];
  let sprintAction: Row['action'] = null;
  if (today.sprint) {
    sprintLines.push(t('today-due', { n: today.due.sprint, defaultValue: 'Due now: {{n}}' }));
    sprintLines.push(
      t('today-most-in-lesson', { where: levelName(t, today.sprint.level), defaultValue: 'Most in “{{where}}”.' }),
    );
    sprintAction = { to: '/rmhmusic/sprint', label: t('today-play-sprint', { defaultValue: 'Play Sprint' }) };
  } else {
    sprintLines.push(t('today-none', { defaultValue: 'Nothing due.' }));
  }

  return [
    {
      family: 'staff',
      name: t('insights-family-staff', { defaultValue: 'Reading notes' }),
      lines: staffLines,
      action: staffReady ? { to: '/rmhmusic/practice', label: t('practice', { defaultValue: 'Practice' }) } : null,
    },
    {
      family: 'interval',
      name: t('insights-family-interval', { defaultValue: 'Reading intervals' }),
      lines: intervalLines,
      action: intervalAction,
    },
    {
      family: 'ear',
      name: t('insights-family-ear', { defaultValue: 'Ear training' }),
      lines: earLines,
      action: earAction,
    },
    {
      family: 'sprint',
      name: t('insights-family-sprint', { defaultValue: 'Sprint' }),
      lines: sprintLines,
      action: sprintAction,
    },
  ];
}

function ActionLink({ action, primary }: { action: RowAction; primary: boolean }) {
  const className = primary ? PRIMARY_BUTTON : SECONDARY_BUTTON;
  if (action.to === '/rmhmusic/lesson/$lessonId') {
    return (
      <Link to={action.to} params={action.params} className={className}>
        {action.label}
      </Link>
    );
  }
  return (
    <Link to={action.to} className={className}>
      {action.label}
    </Link>
  );
}

function TodaySkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <div className="rmm-sheet h-60 p-4">
        <div className="app-skeleton h-6 w-32" />
      </div>
    </div>
  );
}

export function TodayPage() {
  const { t } = useTranslation('c-rmhmusic');
  const gate = useCardsGate();
  const cards = useLearnStore((s) => s.cards);
  const progress = useLearnStore((s) => s.progress);
  const profile = useLearnStore((s) => s.profile);
  const ready = gate === 'ready';
  const newPerDay = profile?.newPerDay ?? DEFAULT_NEW_PER_DAY;
  const view = useMemo(() => {
    if (!ready) return null;
    const now = Date.now();
    const today = buildToday(cards, now, { newPerDay, instrument: profile?.instrument });
    // Practice link semantics as the learn home's: due cards, or new ones a learner who has met
    // flashcards may still be dealt. New learners keep a way in.
    const staffReady = practiceAvailable(cards, progress, now, profile?.instrument, profile?.voiceRange, newPerDay);
    return { today, staffReady };
  }, [ready, cards, progress, profile?.instrument, profile?.voiceRange, newPerDay]);
  const arrival = useArrival(ready);

  const list = view ? rows(t, view.today, view.staffReady) : [];
  // The first row with something to do is the one filled button.
  const primaryFamily = list.find((r) => r.action !== null)?.family;
  return (
    <Shell title={t('today-title', { defaultValue: 'Today' })} busy={gate === 'loading'}>
      <CardsGateNotice state={gate} returnTo="/rmhmusic/today" />
      {gate === 'loading' ? <TodaySkeleton /> : null}
      {view ? (
        <div className={`${arrival ?? ''} space-y-4`}>
          <ul className="rmm-sheet divide-y divide-app-border">
            {list.map((r) => (
              <li key={r.family} className={ROW}>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-app-text">{r.name}</p>
                  {r.lines.map((line) => (
                    <p key={line} className="text-sm text-app-text-muted">
                      {line}
                    </p>
                  ))}
                </div>
                {r.action ? <ActionLink action={r.action} primary={r.family === primaryFamily} /> : null}
              </li>
            ))}
          </ul>
          {primaryFamily === undefined ? (
            <p className="text-app-text-muted">
              {t('today-all-done', { defaultValue: 'Nothing is waiting. Come back when a card is due.' })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4">
            <Link to="/rmhmusic/insights" className={TEXT_BUTTON}>
              {t('today-to-insights', { defaultValue: 'Your strong and weak spots' })}
            </Link>
            <Link to="/rmhmusic" className={TEXT_BUTTON}>
              {t('lesson-back-to-path', { defaultValue: 'Back to your lessons' })}
            </Link>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
