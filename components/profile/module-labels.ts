/**
 * The profile showcase's module names, translated.
 *
 * `MODULE_KINDS` and `MODULE_LABELS` in `lib/profile/modules.ts` are the list;
 * a key built from a kind (`module-${kind}`) is invisible to
 * `pnpm i18n:extract`. Each kind is written out here as a literal call, with
 * the English `MODULE_LABELS` carries;
 * `components/profile/__tests__/module-labels.test.ts` holds them equal.
 */
import type { TFunction } from 'i18next';
import type { ModuleKind } from '@/lib/profile/modules';

/** Translated name per profile module kind (namespace `c-profile-modules`). */
export function profileModuleLabels(t: TFunction): Record<ModuleKind, string> {
  return {
    about: t('module-about', { ns: 'c-profile-modules', defaultValue: 'About' }),
    stats: t('module-stats', { ns: 'c-profile-modules', defaultValue: 'Stats' }),
    status: t('module-status', { ns: 'c-profile-modules', defaultValue: 'Status' }),
    wishlist: t('module-wishlist', { ns: 'c-profile-modules', defaultValue: 'Wishlist' }),
    'slice-it': t('module-slice-it', { ns: 'c-profile-modules', defaultValue: 'Slice It!' }),
    'top-four': t('module-top-four', { ns: 'c-profile-modules', defaultValue: 'Top four' }),
    now: t('module-now', { ns: 'c-profile-modules', defaultValue: 'Now' }),
    stamps: t('module-stamps', { ns: 'c-profile-modules', defaultValue: 'Stamp wall' }),
    webrings: t('module-webrings', { ns: 'c-profile-modules', defaultValue: 'Webrings' }),
    endorsements: t('module-endorsements', { ns: 'c-profile-modules', defaultValue: 'Skills' }),
    counter: t('module-counter', { ns: 'c-profile-modules', defaultValue: 'Visitor counter' }),
    made: t('module-made', { ns: 'c-profile-modules', defaultValue: 'Made here' }),
  };
}
