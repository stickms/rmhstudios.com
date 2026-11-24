import { Link } from '@tanstack/react-router';
import { Activity, Bookmark, ListChecks, MessageCircleQuestion, Mic, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { medButtonClass } from '../controls/MedButton';

export type MedPlace = 'live' | 'tracker' | 'ask' | 'lists' | 'practice';

const ICON: Record<MedPlace, LucideIcon> = {
  live: Activity,
  tracker: ListChecks,
  ask: MessageCircleQuestion,
  lists: Bookmark,
  practice: Mic,
};
const TO = {
  live: '/med/live',
  tracker: '/med/tracker',
  ask: '/med/ask',
  lists: '/med/lists',
  practice: '/med/practice',
} as const;

/**
 * The app's other places as a row of icon-and-label links (tertiary buttons, never pills, so they do not read as the
 * filters under them). One line; on a phone it scrolls sideways rather than wrapping.
 */
export function Places({ places, label }: { places: readonly MedPlace[]; label: string }) {
  const { t } = useTranslation('medschools');
  const name = (p: MedPlace): string => {
    switch (p) {
      case 'live':
        return t('index-live', { defaultValue: 'Live activity' });
      case 'tracker':
        return t('index-my-tracker', { defaultValue: 'My tracker' });
      case 'ask':
        return t('index-ask', { defaultValue: 'Ask' });
      case 'lists':
        return t('index-my-lists', { defaultValue: 'My lists' });
      case 'practice':
        return t('index-practice', { defaultValue: 'Interview practice' });
    }
  };
  return (
    <nav className="medapp-places" aria-label={label}>
      {places.map((p) => {
        const Icon = ICON[p];
        return (
          <Link key={p} to={TO[p]} className={medButtonClass('tertiary')}>
            <Icon aria-hidden="true" className="size-4" />
            {name(p)}
          </Link>
        );
      })}
    </nav>
  );
}
