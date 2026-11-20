import {
  describe,
  expect,
  it,
} from 'vitest';
import type { RegistrySchool } from '../scrape/registry';
import { matchSdnStems } from './sdn-match';

const school =
  (
    key: string,
    name: string,
    degree:
      | 'MD'
      | 'DO',
  ): RegistrySchool => ({
    slug: key.toLowerCase(),
    name,
    shortName:
      key,
    degree,
    city: 'X',
    state:
      'NY',
    country:
      'US',
    website:
      null,
    aliases:
      [
        {
          source:
            'CYCLETRACK',
          sourceKey:
            key,
        },
      ],
  });

const duke =
  school(
    'Duke',
    'Duke University School of Medicine',
    'MD',
  );
const none =
  {
    summaries:
      [],
    overrides:
      {},
  };

describe('matchSdnStems', () => {
  it('exact normalised name matches one school', () => {
    const r =
      matchSdnStems(
        {
          stems:
            [
              {
                stem: 'Duke University School of Medicine',
                degree:
                  'MD',
              },
            ],
          schools:
            [
              duke,
              school(
                'Yale',
                'Yale School of Medicine',
                'MD',
              ),
            ],
          ...none,
        },
      );
    expect(
      r,
    ).toEqual(
      {
        aliases:
          [
            {
              cycletrackKey:
                'Duke',
              threadStems:
                [
                  'Duke University School of Medicine',
                ],
            },
          ],
        review:
          [],
        ignored:
          [],
      },
    );
  });

  it('matches on the short name, & and punctuation', () => {
    const r =
      matchSdnStems(
        {
          stems:
            [
              {
                stem: 'Texas A&M',
                degree:
                  'MD',
              },
            ],
          schools:
            [
              school(
                'Texas A&M',
                'Texas A.M. Health Science Center College of Medicine',
                'MD',
              ),
            ],
          ...none,
        },
      );
    expect(
      r.aliases.map(
        (
          a,
        ) =>
          a.cycletrackKey,
      ),
    ).toEqual(
      [
        'Texas A&M',
      ],
    );
  });

  it('an MD thread cannot match a DO school of the same name', () => {
    const r =
      matchSdnStems(
        {
          stems:
            [
              {
                stem: 'Alabama',
                degree:
                  'MD',
              },
            ],
          schools:
            [
              school(
                'Alabama COM',
                'Alabama College of Osteopathic Medicine',
                'DO',
              ),
              school(
                'X',
                'Alabama',
                'DO',
              ),
            ],
          ...none,
        },
      );
    expect(
      r.aliases,
    ).toEqual(
      [],
    );
    expect(
      r.review,
    ).toEqual(
      [
        'Alabama',
      ],
    );
  });

  it('ambiguous (two schools share a normalised key) goes to review, not alias', () => {
    const r =
      matchSdnStems(
        {
          stems:
            [
              {
                stem: 'Georgetown',
                degree:
                  'MD',
              },
            ],
          schools:
            [
              school(
                'G1',
                'Georgetown University School of Medicine',
                'MD',
              ),
              school(
                'G2',
                'Georgetown College of Medicine',
                'MD',
              ),
            ],
          ...none,
        },
      );
    expect(
      r.aliases,
    ).toEqual(
      [],
    );
    expect(
      r.review,
    ).toEqual(
      [
        'Georgetown',
      ],
    );
  });

  it('override maps and ignore overrides win', () => {
    const r =
      matchSdnStems(
        {
          stems:
            [
              {
                stem: 'Missouri, Kansas City',
                degree:
                  'MD',
              },
              {
                stem: 'Duke University School of Medicine',
                degree:
                  'MD',
              },
              {
                stem: 'Junk',
                degree:
                  'MD',
              },
            ],
          schools:
            [
              duke,
              school(
                'UMKC',
                'UMKC School of Medicine',
                'MD',
              ),
            ],
          summaries:
            [],
          overrides:
            {
              'Missouri, Kansas City':
                {
                  cycletrackKey:
                    'UMKC',
                },
              'Duke University School of Medicine':
                {
                  ignore: true,
                },
              Junk: {
                ignore: true,
              },
            },
        },
      );
    expect(
      r.aliases,
    ).toEqual(
      [
        {
          cycletrackKey:
            'UMKC',
          threadStems:
            [
              'Missouri, Kansas City',
            ],
        },
      ],
    );
    expect(
      r.ignored,
    ).toEqual(
      [
        'Duke University School of Medicine',
        'Junk',
      ],
    );
    expect(
      r.review,
    ).toEqual(
      [],
    );
  });

  it('attaches a summary by normalised name and lets a school keep several stems', () => {
    const r =
      matchSdnStems(
        {
          stems:
            [
              {
                stem: 'Duke',
                degree:
                  'MD',
              },
              {
                stem: 'Duke University School of Medicine',
                degree:
                  'MD',
              },
            ],
          schools:
            [
              duke,
            ],
          summaries:
            [
              {
                code: 'DUKE',
                slug: 'duke-university',
                name: 'Duke University School of Medicine',
              },
            ],
          overrides:
            {},
        },
      );
    expect(
      r.aliases,
    ).toEqual(
      [
        {
          cycletrackKey:
            'Duke',
          threadStems:
            [
              'Duke',
              'Duke University School of Medicine',
            ],
          summary:
            {
              code: 'DUKE',
              slug: 'duke-university',
            },
        },
      ],
    );
  });

  it('an unmatched summary goes to review under its summary key', () => {
    const r =
      matchSdnStems(
        {
          stems:
            [],
          schools:
            [
              duke,
            ],
          summaries:
            [
              {
                code: 'ZZ',
                slug: 'zed',
                name: 'Zed',
              },
            ],
          overrides:
            {},
        },
      );
    expect(
      r.review,
    ).toEqual(
      [
        'summary:ZZ/zed',
      ],
    );
  });

  it('is deterministic: sorted by cycletrackKey regardless of input order', () => {
    const yale =
      school(
        'Yale',
        'Yale School of Medicine',
        'MD',
      );
    const a =
      matchSdnStems(
        {
          stems:
            [
              {
                stem: 'Yale',
                degree:
                  'MD',
              },
              {
                stem: 'Duke',
                degree:
                  'MD',
              },
            ],
          schools:
            [
              yale,
              duke,
            ],
          ...none,
        },
      );
    const b =
      matchSdnStems(
        {
          stems:
            [
              {
                stem: 'Duke',
                degree:
                  'MD',
              },
              {
                stem: 'Yale',
                degree:
                  'MD',
              },
            ],
          schools:
            [
              duke,
              yale,
            ],
          ...none,
        },
      );
    expect(
      a,
    ).toEqual(
      b,
    );
    expect(
      a.aliases.map(
        (
          x,
        ) =>
          x.cycletrackKey,
      ),
    ).toEqual(
      [
        'Duke',
        'Yale',
      ],
    );
  });
});
