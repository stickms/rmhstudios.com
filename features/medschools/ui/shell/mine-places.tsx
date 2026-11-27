import {
  BarChart3,
  CalendarCheck,
  ListChecks,
  MessageCircleQuestion,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

// The member's places. "My stats" (phase D) is the private stats; the AI list builder is reached from My school lists.
// Shared by the bar's profile menu (600px and up) and the phone drawer.
export type Mine = 'cycle' | 'lists' | 'stats' | 'prefs' | 'ask';
export const MINE: { id: Mine; to: string; hash?: string; icon: LucideIcon }[] = [
  { id: 'cycle', to: '/med/tracker', icon: CalendarCheck },
  { id: 'lists', to: '/med/lists', icon: ListChecks },
  { id: 'stats', to: '/med/stats', icon: BarChart3 },
  { id: 'prefs', to: '/med/lists', hash: 'preferences', icon: SlidersHorizontal },
  { id: 'ask', to: '/med/ask', icon: MessageCircleQuestion },
];

/** The places' names, translated. */
export function useMineNames(): (id: Mine) => string {
  const { t } = useTranslation('medschools');
  return (id) => {
    switch (id) {
      case 'cycle':
        return t('shell-mine-cycle', { defaultValue: 'My cycle' });
      case 'lists':
        return t('shell-mine-lists', { defaultValue: 'My school lists' });
      case 'stats':
        return t('shell-mine-stats', { defaultValue: 'My stats' });
      case 'prefs':
        return t('shell-mine-prefs', { defaultValue: 'Preferences' });
      case 'ask':
        return t('shell-mine-ask', { defaultValue: 'Ask about schools' });
    }
  };
}
