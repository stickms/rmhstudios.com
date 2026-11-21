/**
 * ToolCards — the practice tools (sight reading, tuner, songs, practice history) as cards at the top of the
 * home, above the instrument toggle and the path. Static links with no data behind them, so they
 * render the same in the loading, loaded and error states and their arrival moves nothing.
 *
 * One column on a phone (icon beside the text), two across from `sm`.
 */

import { Link } from '@tanstack/react-router';
import {
  Eye,
  Gauge,
  History,
  ListMusic,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Tool = {
  to: '/rmhmusic/sprint' | '/rmhmusic/tuner' | '/rmhmusic/songs' | '/rmhmusic/history';
  icon: LucideIcon;
  title: string;
  description: string;
};

export function ToolCards() {
  const { t } = useTranslation('c-rmhmusic');
  const { t: ts } = useTranslation('music-history');
  const tools: Tool[] = [
    {
      to: '/rmhmusic/sprint',
      icon: Eye,
      title: t('sprint-home-link', { defaultValue: 'Sight reading' }),
      description: t('sprint-home-card', {
        defaultValue: 'Read notes against the clock.',
      }),
    },
    {
      to: '/rmhmusic/tuner',
      icon: Gauge,
      title: t('tuner-home-link', { defaultValue: 'Tuner' }),
      description: t('tuner-home-card', {
        defaultValue: 'Tune up, or see the note you play.',
      }),
    },
    {
      to: '/rmhmusic/songs',
      icon: ListMusic,
      title: t('songs-home-link', { defaultValue: 'Songs' }),
      description: t('songs-home-card', {
        defaultValue: 'Play along with a score.',
      }),
    },
    {
      to: '/rmhmusic/history',
      icon: History,
      title: ts('home-link', { defaultValue: 'Practice history' }),
      description: ts('home-card', {
        defaultValue: 'Minutes, goal days and every song attempt.',
      }),
    },
  ];

  return (
    <nav aria-label={t('tools-label', { defaultValue: 'Practice tools' })}>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <li key={tool.to} className="min-w-0">
              <Link
                to={tool.to}
                className="rmm-sheet rmm-tool flex h-full min-h-11 min-w-0 items-start gap-3 p-4 sm:flex-col sm:gap-2"
              >
                <Icon
                  className="h-5 w-5 shrink-0 text-app-accent"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold break-words text-app-text">
                    {tool.title}
                  </span>
                  <span className="mt-0.5 block text-sm break-words text-app-text-muted">
                    {tool.description}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
