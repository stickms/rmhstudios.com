'use client';

/**
 * Getting Started — the first window a new desktop opens, like Windows 7's
 * Welcome Center: who's logged on, where the marathon stands, and one-click
 * tasks for everything on the computer.
 */

import { useTranslation } from 'react-i18next';
import { formatMinutes } from '@/lib/dunesday/schedule';
import { DUNESDAY } from '@/lib/dunesday/titles';
import { VIDEOS } from '@/lib/dunesday/vfs';
import { useDunesday } from '../../DunesdayProvider';
import { fmtDay, LONG } from '../../format';
import { Win7Progress } from '../../Win7Progress';
import { openApp } from '../actions';
import { Icon, type IconName } from '../icons';
import { UserTile } from '../UserTile';
import { useProfile } from '../useProfile';

export default function WelcomeApp() {
  const { t, i18n } = useTranslation('c-dunesday');
  const { pct, plan, remainingMinutes } = useDunesday();
  const profile = useProfile();

  const tasks: { icon: IconName; title: string; text: string; run: () => void }[] = [
    {
      icon: 'planner',
      title: t('wc-plan', { defaultValue: 'Plan your marathon' }),
      text: t('wc-plan-text', {
        defaultValue: 'Pick a start date and a daily pace, or tell it when you must finish.',
      }),
      run: () => openApp('planner'),
    },
    {
      icon: 'folder-videos',
      title: t('wc-list', { defaultValue: 'Browse the watch list' }),
      text: t('wc-list-text', {
        defaultValue: 'Every film and show, by phase. Drag one to the Recycle Bin to skip it.',
      }),
      run: () => openApp('explorer', { params: { path: VIDEOS } }),
    },
    {
      icon: 'calendar',
      title: t('wc-cal', { defaultValue: 'See your calendar' }),
      text: t('wc-cal-text', {
        defaultValue: 'Day by day until Dunesday, and an .ics file for your own calendar.',
      }),
      run: () => openApp('calendar'),
    },
    {
      icon: 'player',
      title: t('wc-tonight', { defaultValue: 'Watch tonight' }),
      text: t('wc-tonight-text', {
        defaultValue: 'Tonight’s lineup in Media Player — tick titles off as you go.',
      }),
      run: () => openApp('player'),
    },
    {
      icon: 'messenger',
      title: t('wc-ask', { defaultValue: 'Ask Messenger' }),
      text: t('wc-ask-text', {
        defaultValue: 'A spoiler-safe AI buddy that knows your plan and the movies.',
      }),
      run: () => openApp('messenger'),
    },
    {
      icon: 'sync',
      title: t('wc-sync', { defaultValue: 'Sync, calendar feed and Discord' }),
      text: t('wc-sync-text', {
        defaultValue:
          'Keep devices in step, subscribe from Google or Apple Calendar, post to a channel.',
      }),
      run: () => openApp('sync'),
    },
    {
      icon: 'personalize',
      title: t('wc-personalize', { defaultValue: 'Personalize Dunesday 7' }),
      text: t('wc-personalize-text', {
        defaultValue: 'Wallpapers, glass colour, text size, contrast and motion.',
      }),
      run: () => openApp('personalize'),
    },
    {
      icon: 'solitaire',
      title: t('wc-games', { defaultValue: 'Take a break' }),
      text: t('wc-games-text', {
        defaultValue: 'Solitaire, Spider Solitaire and Minesweeper live in the Start menu.',
      }),
      run: () => openApp('solitaire'),
    },
  ];

  return (
    <div className="ds-welcome">
      <header className="ds-welcome-head">
        <UserTile image={profile.image} size={64} />
        <div>
          <h1>{t('wc-hello', { defaultValue: 'Welcome, {{name}}', name: profile.name })}</h1>
          <p>
            {t('wc-status', {
              defaultValue: '{{pct}}% watched · {{left}} to go · Dunesday is {{date}}',
              pct,
              left: formatMinutes(remainingMinutes),
              date: fmtDay(DUNESDAY, i18n.language, LONG),
            })}
          </p>
          <Win7Progress
            value={pct / 100}
            label={t('wc-progress', { defaultValue: 'Marathon progress' })}
          />
          {plan.finishDate && (
            <p className="ds-welcome-note">
              {plan.onTime
                ? t('wc-on-time', {
                    defaultValue: 'At this pace you finish on {{date}}.',
                    date: fmtDay(plan.finishDate, i18n.language, LONG),
                  })
                : t('wc-late', {
                    defaultValue:
                      'At this pace you finish on {{date}} — after Dunesday. Open the planner to fix it.',
                    date: fmtDay(plan.finishDate, i18n.language, LONG),
                  })}
            </p>
          )}
        </div>
      </header>
      <ul className="ds-welcome-tasks">
        {tasks.map((task) => (
          <li key={task.title}>
            <button type="button" onClick={task.run}>
              <Icon name={task.icon} size={40} />
              <span>
                <strong>{task.title}</strong>
                <small>{task.text}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
