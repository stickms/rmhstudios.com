/**
 * The friends-online widget's activity line, translated.
 *
 * A key built from the activity's kind (`activity-${kind}`) is invisible to
 * `pnpm i18n:extract`. The kinds the presence service reports are written out
 * here as literal calls; any other kind shows the label the server sent,
 * never a key. `components/feed/__tests__/activity-labels.test.ts` pins the
 * key and English.
 */
import type { TFunction } from 'i18next';

/** Translated line for a friend's activity (namespace `feed`). */
export function friendActivityLabel(t: TFunction, activity: { kind: string; label: string }): string {
  if (activity.kind === 'rmhtube') {
    return t('activity-rmhtube', { ns: 'feed', defaultValue: 'Watching together' });
  }
  return activity.label;
}
