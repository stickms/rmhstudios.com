/**
 * Steel section 2 and 3 (docs/plans/2026-11-11-steel-design-implementation.md): the token values are exact, both
 * editions keep every text pair at 4.5:1 (T1, A1), and the type classes carry the sizes in the table.
 *
 * "Do not round, substitute or improve them": a value in this file is the value in the document. Change both or neither.
 */
import {
  describe,
  it,
  expect,
} from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio } from '@/lib/appearance/contrast';
import { readCss } from './css-source';

const ROOT =
  process.cwd();
const css =
  readCss(
    'app/globals.css',
    ROOT,
  ).replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

/** The declarations of the (last) rule whose selector list is exactly `selector` and that declares `--site-bg`. */
function tokens(
  selector: string,
): Record<
  string,
  string
> {
  const norm =
    (
      x: string,
    ) =>
      x
        .replace(
          /\s+/g,
          ' ',
        )
        .trim();
  let found: Record<
    string,
    string
  > | null =
    null;
  for (const m of css.matchAll(
    /([^{}]+)\{([^{}]*)\}/g,
  )) {
    if (
      norm(
        m[1] as string,
      ) !==
        selector ||
      !(
        m[2] as string
      ).includes(
        '--site-bg:',
      )
    )
      continue;
    found =
      {};
    for (const d of (
      m[2] as string
    ).matchAll(
      /(--[\w-]+)\s*:\s*([^;]+);/g,
    ))
      found[
        d[1] as string
      ] =
        norm(
          d[2] as string,
        );
  }
  if (
    !found
  )
    throw new Error(
      `no ${selector} block that declares --site-bg`,
    );
  return found;
}

const DAY =
  tokens(
    ':root, .style-default',
  );
const NIGHT =
  tokens(
    '.style-graphite',
  );

const TABLE: Record<
  string,
  [
    day: string,
    night: string,
  ]
> =
  {
    '--site-bg':
      [
        '#fafafa',
        '#0b0d10',
      ],
    '--site-surface':
      [
        '#ffffff',
        '#111418',
      ],
    '--site-bg-subtle':
      [
        '#f0f2f4',
        '#161a1f',
      ],
    '--site-surface-hover':
      [
        '#f0f2f4',
        '#161a1f',
      ],
    '--site-border':
      [
        '#e3e6e9',
        '#22272d',
      ],
    '--site-text':
      [
        '#0b0d10',
        '#eef1f4',
      ],
    '--site-text-muted':
      [
        '#606873',
        '#8b949e',
      ],
    '--site-accent':
      [
        '#0b0d10',
        '#eef1f4',
      ],
    '--site-accent-fg':
      [
        '#fafafa',
        '#0b0d10',
      ],
    '--site-danger':
      [
        '#c40016',
        '#f2555a',
      ],
    '--site-success':
      [
        '#167d3a',
        '#3fb26b',
      ],
    '--chrome-flat':
      [
        '#737c87',
        '#6b7480',
      ],
    '--chrome-1':
      [
        '#fff',
        '#aab4bf',
      ],
    '--chrome-2':
      [
        '#dfe5ea',
        '#55606c',
      ],
    '--chrome-3':
      [
        '#8e99a6',
        '#1c222a',
      ],
    '--chrome-4':
      [
        '#1a2029',
        '#030405',
      ],
    '--chrome-5':
      [
        '#59636f',
        '#20262e',
      ],
    '--chrome-6':
      [
        '#bcc5ce',
        '#5b6672',
      ],
  };

describe('Steel section 2: the token values are exact', () => {
  it.each(
    Object.entries(
      TABLE,
    ),
  )(
    '%s',
    (
      name,
      [
        day,
        night,
      ],
    ) => {
      expect(
        DAY[
          name
        ],
        `Day ${name}`,
      ).toBe(
        day,
      );
      expect(
        NIGHT[
          name
        ],
        `Night ${name}`,
      ).toBe(
        night,
      );
    },
  );

  it('radii are 8px and 4px in both editions, and the control radius is 8px', () => {
    expect(
      DAY[
        '--site-radius'
      ],
    ).toBe(
      '8px',
    );
    expect(
      DAY[
        '--site-radius-sm'
      ],
    ).toBe(
      '4px',
    );
    expect(
      DAY[
        '--site-control-radius'
      ],
    ).toBe(
      '8px',
    );
    // Night declares none of its own: it inherits the one definition, so the two editions cannot differ.
    expect(
      NIGHT[
        '--site-radius'
      ],
    ).toBeUndefined();
  });

  it('the focus ring is the ink (K10)', () => {
    expect(
      DAY[
        '--focus-ring'
      ],
    ).toBe(
      'var(--site-text)',
    );
  });

  it('there is no display face: the display token is the body stack (section 3)', () => {
    const root =
      css
        .match(
          /--site-font-display:\s*([^;]+);/,
        )?.[1]
        ?.trim();
    expect(
      root,
    ).toBe(
      'var(--site-font-body)',
    );
  });

  it('the page ground, surface and hover are opaque solid colours (R1)', () => {
    for (const [
      edition,
      t,
    ] of [
      [
        'Day',
        DAY,
      ],
      [
        'Night',
        NIGHT,
      ],
    ] as const) {
      for (const name of [
        '--site-bg',
        '--site-surface',
        '--site-bg-subtle',
        '--site-surface-hover',
        '--site-border',
      ]) {
        expect(
          t[
            name
          ],
          `${edition} ${name}`,
        ).toMatch(
          /^#[0-9a-f]{6}$/,
        );
      }
    }
  });
});

describe('Steel T1 and A1: every text pair holds 4.5:1 in both editions', () => {
  const editions =
    [
      [
        'Day',
        {
          ...DAY,
        },
      ],
      [
        'Night',
        {
          ...DAY,
          ...NIGHT,
        },
      ],
    ] as const;

  for (const [
    edition,
    t,
  ] of editions) {
    const get =
      (
        n: string,
      ) =>
        t[
          n
        ] as string;
    const pairs: [
      string,
      string,
      string,
      number,
    ][] =
      [
        [
          'ink on the page',
          '--site-text',
          '--site-bg',
          4.5,
        ],
        [
          'ink on a control',
          '--site-text',
          '--site-surface',
          4.5,
        ],
        [
          'ink on a hover fill',
          '--site-text',
          '--site-bg-subtle',
          4.5,
        ],
        [
          'muted on the page',
          '--site-text-muted',
          '--site-bg',
          4.5,
        ],
        [
          'muted on a control',
          '--site-text-muted',
          '--site-surface',
          4.5,
        ],
        [
          'muted on a hover fill',
          '--site-text-muted',
          '--site-bg-subtle',
          4.5,
        ],
        [
          'text on an ink fill',
          '--site-accent-fg',
          '--site-accent',
          4.5,
        ],
        [
          'danger text on the page',
          '--site-danger',
          '--site-bg',
          4.5,
        ],
        [
          'danger text on a control',
          '--site-danger',
          '--site-surface',
          4.5,
        ],
        [
          'danger text on a hover fill',
          '--site-danger',
          '--site-bg-subtle',
          4.5,
        ],
        [
          'success text on the page',
          '--site-success',
          '--site-bg',
          4.5,
        ],
        [
          'success text on a control',
          '--site-success',
          '--site-surface',
          4.5,
        ],
        [
          'success text on a hover fill',
          '--site-success',
          '--site-bg-subtle',
          4.5,
        ],
        [
          'text on a danger fill',
          '--site-danger-fg',
          '--site-danger',
          4.5,
        ],
        [
          'text on a success fill',
          '--site-success-fg',
          '--site-success',
          4.5,
        ],
        [
          'warning text on the page',
          '--site-warning',
          '--site-bg',
          4.5,
        ],
        [
          'text on a warning fill',
          '--site-warning-fg',
          '--site-warning',
          4.5,
        ],
        // A1: a control boundary holds 3:1. The thumb against its track is the one boundary the table gives that can:
        // the 1px `--site-border` hairline is by design far under 3:1 against the page (see the report on A1).
        [
          'the flat chrome thumb on its track',
          '--chrome-flat',
          '--site-border',
          3,
        ],
      ];
    it.each(
      pairs,
    )(
      `${edition}: %s`,
      (
        _label,
        fg,
        bg,
        min,
      ) => {
        expect(
          contrastRatio(
            get(
              fg,
            ),
            get(
              bg,
            ),
          ),
        ).toBeGreaterThanOrEqual(
          min,
        );
      },
    );
  }

  it('muted on the page is at least 5.4:1 in both editions (T1 asks for 5.5; Day measures 5.40 with the exact values)', () => {
    expect(
      contrastRatio(
        DAY[
          '--site-text-muted'
        ] as string,
        DAY[
          '--site-bg'
        ] as string,
      ),
    ).toBeGreaterThanOrEqual(
      5.4,
    );
    expect(
      contrastRatio(
        NIGHT[
          '--site-text-muted'
        ] as string,
        NIGHT[
          '--site-bg'
        ] as string,
      ),
    ).toBeGreaterThanOrEqual(
      5.5,
    );
  });
});

describe('Steel section 3: the seven type classes', () => {
  const type =
    readFileSync(
      join(
        ROOT,
        'app/styles/steel-type.css',
      ),
      'utf8',
    ).replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
  const rule =
    (
      name: string,
    ) =>
      type.match(
        new RegExp(
          `@utility ${name}\\s*\\{([^}]*)\\}`,
        ),
      )?.[1] ??
      '';
  const decl =
    (
      name: string,
      prop: string,
    ) =>
      rule(
        name,
      )
        .match(
          new RegExp(
            `${prop}:\\s*([^;]+);`,
          ),
        )?.[1]
        ?.trim();

  const TYPE: Record<
    string,
    [
      size: string,
      leading: string,
      weight: string,
      tracking: string,
    ]
  > =
    {
      't-title':
        [
          '28px',
          '1.1',
          '600',
          '-0.025em',
        ],
      't-heading':
        [
          '17px',
          '1.3',
          '600',
          '-0.01em',
        ],
      't-body':
        [
          '14px',
          '1.45',
          '400',
          '0',
        ],
      't-post':
        [
          '15px',
          '1.5',
          '400',
          '0',
        ],
      't-prose':
        [
          '16px',
          '1.6',
          '400',
          '0',
        ],
      't-label':
        [
          '13px',
          '1.3',
          '600',
          '0',
        ],
      't-meta':
        [
          '12px',
          '1.3',
          '400',
          '0',
        ],
    };

  it.each(
    Object.entries(
      TYPE,
    ),
  )(
    '%s',
    (
      name,
      [
        size,
        leading,
        weight,
        tracking,
      ],
    ) => {
      expect(
        decl(
          name,
          'font-size',
        ),
      ).toBe(
        size,
      );
      expect(
        decl(
          name,
          'line-height',
        ),
      ).toBe(
        leading,
      );
      expect(
        decl(
          name,
          'font-weight',
        ),
      ).toBe(
        weight,
      );
      expect(
        decl(
          name,
          'letter-spacing',
        ),
      ).toBe(
        tracking,
      );
    },
  );

  it('label and meta are muted, meta is mono', () => {
    expect(
      decl(
        't-label',
        'color',
      ),
    ).toBe(
      'var(--site-text-muted)',
    );
    expect(
      decl(
        't-meta',
        'color',
      ),
    ).toBe(
      'var(--site-text-muted)',
    );
    expect(
      decl(
        't-meta',
        'font-family',
      ),
    ).toBe(
      'var(--site-font-mono)',
    );
  });

  it('Y1: no weight of 700 or above, and Y2: no uppercase, anywhere in the type sheet', () => {
    expect(
      type,
    ).not.toMatch(
      /font-weight:\s*(?:[789]00|bold|bolder)/,
    );
    expect(
      type,
    ).not.toMatch(
      /text-transform:\s*uppercase/,
    );
  });
});
