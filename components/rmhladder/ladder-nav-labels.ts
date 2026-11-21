/**
 * The RMH Ladder sub-navigation's tab names, translated.
 *
 * A key built from the tab's label (`ladder.nav.${label.toLowerCase()}`) is
 * invisible to `pnpm i18n:extract`. Each tab is written out here as a literal
 * call, keyed by its lower-cased English label; Offers and Insights have their
 * own namespaces and are translated in the shell. A tab this map does not know
 * shows its raw label. `components/rmhladder/__tests__/ladder-nav-labels.test.ts`
 * holds the map equal to the shell's tab lists.
 */
import type { TFunction } from 'i18next';

/** Translated tab name per lower-cased English label (namespace `site`). */
export function ladderNavLabels(t: TFunction): Record<string, string> {
  return {
    overview: t('ladder.nav.overview', { ns: 'site', defaultValue: 'Overview' }),
    jobs: t('ladder.nav.jobs', { ns: 'site', defaultValue: 'Jobs' }),
    resume: t('ladder.nav.resume', { ns: 'site', defaultValue: 'Resume' }),
    referrals: t('ladder.nav.referrals', { ns: 'site', defaultValue: 'Referrals' }),
    pipeline: t('ladder.nav.pipeline', { ns: 'site', defaultValue: 'Pipeline' }),
    alerts: t('ladder.nav.alerts', { ns: 'site', defaultValue: 'Alerts' }),
    settings: t('ladder.nav.settings', { ns: 'site', defaultValue: 'Settings' }),
    review: t('ladder.nav.review', { ns: 'site', defaultValue: 'Review' }),
    companies: t('ladder.nav.companies', { ns: 'site', defaultValue: 'Companies' }),
    health: t('ladder.nav.health', { ns: 'site', defaultValue: 'Health' }),
  };
}
