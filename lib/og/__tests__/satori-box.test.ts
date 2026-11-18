/**
 * The OG cards are laid out for `box-sizing: border-box`, which satori used for
 * every element up to 0.35. From 0.38 it defaults to CSS's `content-box`, and
 * every padded box grows by its padding: the cards render shifted and cropped,
 * with no error. `lib/og/satori.server.ts` puts border-box back; this holds it.
 */
import { execFileSync } from 'node:child_process';
import { createElement as h } from 'react';
import {
  describe,
  expect,
  it,
} from 'vitest';
import satori, {
  withBorderBox,
} from '../satori.server';

const card =
  h(
    'div',
    {
      style:
        {
          display:
            'flex',
          width:
            '100px',
          height:
            '100px',
          padding:
            '20px',
          background:
            '#000',
        },
    },
    h(
      'div',
      {
        style:
          {
            display:
              'flex',
            width:
              '100%',
            height:
              '100%',
            background:
              '#f00',
          },
      },
    ),
  );

describe('satori wrapper', () => {
  it('lays a padded box out border-box, as the cards expect', async () => {
    const svg =
      await satori(
        card,
        {
          width: 100,
          height: 100,
          fonts:
            [],
        },
      );
    // The red inner box sits inside the 20px padding of a 100px box: 60px square at (20, 20).
    expect(
      svg,
    ).toMatch(
      /<rect x="20" y="20" width="60" height="60"[^>]*fill="#f00"/,
    );
  });

  it('keeps a box-sizing an element chose, and expands function components', () => {
    const Leaf =
      () =>
        h(
          'div',
          {
            style:
              {
                width:
                  '1px',
              },
          },
        );
    const tree =
      withBorderBox(
        h(
          'div',
          {
            style:
              {
                boxSizing:
                  'content-box',
              },
          },
          h(
            Leaf,
          ),
          'text',
        ),
      ) as {
        props: {
          style: object;
          children: [
            {
              props: {
                style: object;
              };
            },
            string,
          ];
        };
      };
    expect(
      tree
        .props
        .style,
    ).toEqual(
      {
        boxSizing:
          'content-box',
      },
    );
    expect(
      tree
        .props
        .children[0]
        .props
        .style,
    ).toEqual(
      {
        boxSizing:
          'border-box',
        width:
          '1px',
      },
    );
    expect(
      tree
        .props
        .children[1],
    ).toBe(
      'text',
    );
  });

  it('is the only module that imports satori', () => {
    const hits =
      execFileSync(
        'git',
        [
          'grep',
          '-lE',
          'from [\'"]satori[\'"]',
          '--',
          '*.ts',
          '*.tsx',
          '*.mts',
          '*.mjs',
        ],
        {
          encoding:
            'utf8',
        },
      )
        .split(
          '\n',
        )
        .filter(
          Boolean,
        );
    expect(
      hits,
    ).toEqual(
      [
        'lib/og/satori.server.ts',
      ],
    );
  });
});
