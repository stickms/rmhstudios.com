/**
 * The sight reading sheet's markup: the notes drawn (heads, accidentals, the now mark), the
 * pencil mark once answered, and the right notes written under the staff left to right whatever
 * the page's direction. Rendered with `react-dom/server` (the suite runs in `node`).
 */
import {
  describe,
  expect,
  it,
} from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SprintSheet,
  sheetNoteName,
} from './StaffCard';

const n =
  (
    written: number,
    accidental:
      | -1
      | 0
      | 1 = 0,
  ) => ({
    written,
    accidental,
  });
const count =
  (
    html: string,
    tag: string,
  ) =>
    (
      html.match(
        new RegExp(
          `<${tag}\\b`,
          'g',
        ),
      ) ??
      []
    )
      .length;

describe('SprintSheet', () => {
  it('stacks a chord: three heads, one stem, names hidden while asking', () => {
    const html =
      renderToStaticMarkup(
        <SprintSheet
          clef="treble"
          notes={[
            n(
              60,
            ),
            n(
              64,
            ),
            n(
              67,
            ),
          ]}
          arrangement="chord"
          state="ask"
          label="A chord"
        />,
      );
    expect(
      count(
        html,
        'ellipse',
      ),
    ).toBe(
      3,
    );
    expect(
      count(
        html,
        'line',
      ),
    ).toBe(
      1,
    );
    expect(
      html,
    ).toContain(
      '<title',
    );
    expect(
      html,
    ).toMatch(
      /<figcaption[^>]*dir="ltr"[^>]*><\/figcaption>/,
    );
    expect(
      count(
        html,
        'text',
      ),
    ).toBe(
      0,
    );
  });

  it('writes the right notes under the staff once answered, with sharps and flats', () => {
    const html =
      renderToStaticMarkup(
        <SprintSheet
          clef="treble"
          notes={[
            n(
              62,
            ),
            n(
              65,
              1,
            ),
            n(
              69,
            ),
          ]}
          arrangement="chord"
          state="wrong"
          label="D major"
        />,
      );
    expect(
      html,
    ).toContain(
      'D F♯ A',
    );
    expect(
      html,
    ).toContain(
      'text-app-danger',
    );
  });

  it('a bar: four heads, four stems, and the now mark only while asking', () => {
    const notes =
      [
        n(
          60,
        ),
        n(
          62,
        ),
        n(
          64,
        ),
        n(
          65,
        ),
      ];
    const asking =
      renderToStaticMarkup(
        <SprintSheet
          clef="bass"
          notes={
            notes
          }
          arrangement="bar"
          now={
            1
          }
          state="ask"
          label="Four notes"
        />,
      );
    expect(
      count(
        asking,
        'ellipse',
      ),
    ).toBe(
      4,
    );
    expect(
      count(
        asking,
        'line',
      ),
    ).toBe(
      4,
    );
    const right =
      renderToStaticMarkup(
        <SprintSheet
          clef="bass"
          notes={
            notes
          }
          arrangement="bar"
          now={
            1
          }
          state="right"
          label="Four notes"
        />,
      );
    expect(
      right.length,
    ).not.toBe(
      asking.length,
    );
  });

  it('names a note by its letter and printed accidental', () => {
    expect(
      sheetNoteName(
        n(
          64,
          -1,
        ),
      ),
    ).toBe(
      'E♭',
    );
    expect(
      sheetNoteName(
        n(
          65,
          1,
        ),
      ),
    ).toBe(
      'F♯',
    );
    expect(
      sheetNoteName(
        n(
          71,
        ),
      ),
    ).toBe(
      'B',
    );
  });
});
