import { describe, expect, it } from 'vitest';
import { pickWalkTargets } from './run-support';

describe('pickWalkTargets', () => {
  it('keeps the first key per school and lists duplicates', () => {
    const aliases = [
      {
        schoolId: 'b',
        sourceKey: 'Beta',
      },
      {
        schoolId: 'a',
        sourceKey: 'Alpha 2',
      },
      {
        schoolId: 'a',
        sourceKey: 'Alpha',
      },
      {
        schoolId: 'x',
        sourceKey: 'Inactive',
      },
    ];
    const { targets, duplicates } = pickWalkTargets(aliases, new Set(['a', 'b']));
    expect(targets.map((t) => t.sourceKey)).toEqual(['Alpha', 'Beta']);
    expect(duplicates).toEqual(['Alpha 2']);
  });
});
