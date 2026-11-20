import {
  describe,
  expect,
  it,
} from 'vitest';
import { planAliasMapping } from './alias-rules';

describe('planAliasMapping', () => {
  it('second CYCLETRACK key for a school is refused (SCHOOL_ALREADY_HAS_KEY)', () => {
    const plan =
      planAliasMapping(
        {
          source:
            'CYCLETRACK',
          sourceKey:
            'Yale 2',
          schoolId:
            's1',
          schoolAliases:
            [
              {
                source:
                  'CYCLETRACK',
                sourceKey:
                  'Yale',
              },
            ],
          keyOwner:
            null,
        },
      );
    expect(
      plan,
    ).toMatchObject(
      {
        ok: false,
        code: 'SCHOOL_ALREADY_HAS_KEY',
      },
    );
  });

  it('second ADMIT key refused', () => {
    const plan =
      planAliasMapping(
        {
          source:
            'ADMIT',
          sourceKey:
            'yale-b',
          schoolId:
            's1',
          schoolAliases:
            [
              {
                source:
                  'ADMIT',
                sourceKey:
                  'yale',
              },
            ],
          keyOwner:
            null,
        },
      );
    expect(
      plan,
    ).toMatchObject(
      {
        ok: false,
        code: 'SCHOOL_ALREADY_HAS_KEY',
      },
    );
  });

  it('second SDN key allowed', () => {
    const plan =
      planAliasMapping(
        {
          source:
            'SDN',
          sourceKey:
            'thread-2',
          schoolId:
            's1',
          schoolAliases:
            [
              {
                source:
                  'SDN',
                sourceKey:
                  'thread-1',
              },
            ],
          keyOwner:
            null,
        },
      );
    expect(
      plan,
    ).toEqual(
      {
        ok: true,
      },
    );
  });

  it('key mapped to another school refused (KEY_MAPPED_ELSEWHERE)', () => {
    const plan =
      planAliasMapping(
        {
          source:
            'SDN',
          sourceKey:
            'thread-1',
          schoolId:
            's1',
          schoolAliases:
            [],
          keyOwner:
            {
              schoolId:
                's2',
            },
        },
      );
    expect(
      plan,
    ).toMatchObject(
      {
        ok: false,
        code: 'KEY_MAPPED_ELSEWHERE',
      },
    );
  });

  it('same key to same school is ok', () => {
    const plan =
      planAliasMapping(
        {
          source:
            'ADMIT',
          sourceKey:
            'yale',
          schoolId:
            's1',
          schoolAliases:
            [
              {
                source:
                  'ADMIT',
                sourceKey:
                  'yale',
              },
            ],
          keyOwner:
            {
              schoolId:
                's1',
            },
        },
      );
    expect(
      plan,
    ).toEqual(
      {
        ok: true,
      },
    );
  });
});
