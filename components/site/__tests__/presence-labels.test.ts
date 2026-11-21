/**
 * Every presence activity kind has its context-button verb written out as a
 * literal `t()` call (so `pnpm i18n:extract` sees it), with the English
 * `contextVerb` returns. A kind added to `PresenceActivity` without an entry
 * here fails to compile; a changed verb fails this test.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { presenceContextLabels } from '@/components/site/presence-labels';
import { contextVerb, type PresenceActivityKind } from '@/lib/presence-types';

describe('presence context labels', () => {
  it('covers every activity kind with the English contextVerb returns', () => {
    const { t, calls } = recordingT();
    const labels = presenceContextLabels(t);
    for (const kind of Object.keys(labels) as PresenceActivityKind[]) {
      expect(labels[kind], kind).toBe(contextVerb(kind));
    }
    expect(Object.keys(englishByKey(calls)).sort()).toEqual(
      Object.keys(labels).map((k) => `presence-context-${k}`).sort(),
    );
    expect(Object.keys(labels).sort()).toEqual(['game', 'space', 'tube_room']);
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['site']));
  });
});
