/**
 * The friends rail's one-tap context buttons, translated.
 *
 * `contextVerb` in `lib/presence-types.ts` names each activity kind's verb; a
 * key built from the kind (`presence-context-${kind}`) is invisible to
 * `pnpm i18n:extract`. Each kind is written out here as a literal call, with
 * the English `contextVerb` returns;
 * `components/site/__tests__/presence-labels.test.ts` holds them equal.
 */
import type { TFunction } from 'i18next';
import type { PresenceActivityKind } from '@/lib/presence-types';

/** Translated context-button verb per activity kind (namespace `site`). */
export function presenceContextLabels(t: TFunction): Record<PresenceActivityKind, string> {
  return {
    game: t('presence-context-game', { ns: 'site', defaultValue: 'Join' }),
    space: t('presence-context-space', { ns: 'site', defaultValue: 'Hop in' }),
    tube_room: t('presence-context-tube_room', { ns: 'site', defaultValue: 'Watch' }),
  };
}
