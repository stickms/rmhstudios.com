/**
 * Ranked tier names in the reader's language.
 *
 * The server sends a tier's stable id (`tierId`, and `tier.key` on a ladder row) because its `label` is English. Each
 * name is written out as a literal call, so `pnpm i18n:extract` sees all six and `locales/<lng>/ranked-standing.json`
 * carries them; a key built from the id at run time would be invisible to it. An id this build does not know (an
 * older cached response) falls back to the English label the server sent.
 */
import type { TFunction } from 'i18next';
import type { TierId } from '@/lib/ranked/tiers';

export function tierName(t: TFunction, id: TierId | string | null | undefined, fallback?: string): string {
  switch (id) {
    case 'master':
      return t('tier-master', { ns: 'ranked-standing', defaultValue: 'Master' });
    case 'diamond':
      return t('tier-diamond', { ns: 'ranked-standing', defaultValue: 'Diamond' });
    case 'platinum':
      return t('tier-platinum', { ns: 'ranked-standing', defaultValue: 'Platinum' });
    case 'gold':
      return t('tier-gold', { ns: 'ranked-standing', defaultValue: 'Gold' });
    case 'silver':
      return t('tier-silver', { ns: 'ranked-standing', defaultValue: 'Silver' });
    case 'bronze':
      return t('tier-bronze', { ns: 'ranked-standing', defaultValue: 'Bronze' });
    default:
      return fallback ?? '';
  }
}
