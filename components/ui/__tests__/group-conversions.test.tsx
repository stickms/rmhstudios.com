import {
  describe,
  expect,
  it,
} from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Pagination } from '../pagination';
import { RsvpButton } from '@/components/events/RsvpButton';
import { NewsCategoryTabs } from '@/components/news/NewsCategoryTabs';
import { SelectionBar } from '../selection-bar';
import { ModelToggle } from '@/components/rmhcalculator/ModelToggle';

const buttons =
  (
    html: string,
  ) =>
    html.match(
      /data-slot="button"/g,
    )
      ?.length ??
    0;

describe('related controls are plain Buttons in a labelled group', () => {
  it('Pagination: first/prev/pages/next/last are buttons, the current page is aria-current', () => {
    const html =
      renderToStaticMarkup(
        <Pagination
          page={
            2
          }
          totalPages={
            5
          }
          onPageChange={() => {}}
        />,
      );
    expect(
      buttons(
        html,
      ),
    ).toBeGreaterThanOrEqual(
      7,
    ); // 2 + 2 + at least 3 pages
    expect(
      html.match(
        /aria-current="page"/g,
      ),
    ).toHaveLength(
      1,
    );
  });

  it('RsvpButton: Going and Maybe are one group; the chosen answer is aria-pressed', () => {
    const html =
      renderToStaticMarkup(
        <RsvpButton
          eventId="e1"
          status="maybe"
          goingCount={
            1
          }
          capacity={
            null
          }
        />,
      );
    expect(
      html,
    ).toContain(
      'role="group"',
    );
    expect(
      buttons(
        html,
      ),
    ).toBe(
      2,
    );
    expect(
      html.match(
        /aria-pressed="true"/g,
      ),
    ).toHaveLength(
      1,
    );
  });

  it('NewsCategoryTabs: the category chips are toggles', () => {
    const html =
      renderToStaticMarkup(
        <NewsCategoryTabs
          activeCategory="Tech"
          onCategoryChange={() => {}}
          availableCategories={[
            'Tech',
            'Art',
          ]}
        />,
      );
    expect(
      buttons(
        html,
      ),
    ).toBe(
      3,
    ); // All + 2 categories
    expect(
      html.match(
        /aria-pressed="true"/g,
      ),
    ).toHaveLength(
      1,
    );
  });

  it('SelectionBar: every action and clear are Buttons on a bordered bar', () => {
    const html =
      renderToStaticMarkup(
        <SelectionBar
          count={
            2
          }
          onClear={() => {}}
          onSelectAll={() => {}}
          actions={[
            {
              id: 'archive',
              label:
                'Archive',
              onClick:
                () => {},
            },
            {
              id: 'delete',
              label:
                'Delete',
              onClick:
                () => {},
              variant:
                'danger',
            },
          ]}
        />,
      );
    expect(
      buttons(
        html,
      ),
    ).toBe(
      4,
    ); // Select all, Archive, Delete, Clear
    expect(
      html,
    ).toContain(
      'bg-site-surface',
    );
  });

  it('ModelToggle: a radio group whose options are buttons, the chosen one checked', () => {
    const html =
      renderToStaticMarkup(
        <ModelToggle
          value="chat"
          onChange={() => {}}
        />,
      );
    expect(
      html,
    ).toContain(
      'role="radiogroup"',
    );
    expect(
      html.match(
        /role="radio"/g,
      ),
    ).toHaveLength(
      2,
    );
    expect(
      html.match(
        /aria-checked="true"/g,
      ),
    ).toHaveLength(
      1,
    );
  });
});
