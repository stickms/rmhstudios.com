/**
 * Every history entity type has its filter name written out as a literal `t()`
 * call (so `pnpm i18n:extract` sees it). The English is the type's own id, which
 * is what the filter has always shown. A type added to `HISTORY_ENTITY_TYPES`
 * without an entry here fails to compile.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { historyEntityTypeLabels } from '@/components/history/entity-type-labels';
import { HISTORY_ENTITY_TYPES } from '@/lib/history/constants';

describe('history entity type labels', () => {
  it('covers every type, keyed type-<type>, with the id as English', () => {
    const { t, calls } = recordingT();
    const labels = historyEntityTypeLabels(t);
    expect(labels).toEqual(Object.fromEntries(HISTORY_ENTITY_TYPES.map((type) => [type, type])));
    expect(englishByKey(calls)).toEqual(Object.fromEntries(HISTORY_ENTITY_TYPES.map((type) => [`type-${type}`, type])));
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['c-history']));
  });
});
