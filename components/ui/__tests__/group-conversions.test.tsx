import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Pagination } from '../pagination';
import { RsvpButton } from '@/components/events/RsvpButton';
import { NewsCategoryTabs } from '@/components/news/NewsCategoryTabs';
import { SelectionBar } from '../selection-bar';
import { ModelToggle } from '@/components/rmhcalculator/ModelToggle';

const members = (html: string) => html.match(/data-slot="jelly-group-item"/g)?.length ?? 0;

describe('related controls are one jelly group with flat members', () => {
  it('Pagination: first/prev/pages/next/last share one parent, the current page is selected', () => {
    const html = renderToStaticMarkup(
      <Pagination page={2} totalPages={5} onPageChange={() => {}} />,
    );
    expect(html.match(/data-slot="jelly-group"/g)).toHaveLength(1);
    expect(members(html)).toBeGreaterThanOrEqual(7); // 2 + 2 + at least 3 pages
    expect(html).toMatch(/aria-current="page"/);
    expect(html).not.toContain('data-fluid-press');
  });

  it('RsvpButton: Going and Maybe are one group; the chosen answer is the selected member', () => {
    const html = renderToStaticMarkup(
      <RsvpButton eventId="e1" status="maybe" goingCount={1} capacity={null} />,
    );
    expect(html.match(/data-slot="jelly-group"/g)).toHaveLength(1);
    expect(members(html)).toBe(2);
    expect(html.match(/data-selected=""/g)).toHaveLength(1);
    expect(html).toContain('aria-pressed="true"');
  });

  it('NewsCategoryTabs: the category chips are flat toggles inside the scroller pill', () => {
    const html = renderToStaticMarkup(
      <NewsCategoryTabs
        activeCategory="Tech"
        onCategoryChange={() => {}}
        availableCategories={['Tech', 'Art']}
      />,
    );
    expect(members(html)).toBe(3); // All + 2 categories
    expect(html.match(/data-selected=""/g)).toHaveLength(1);
    expect(html).not.toMatch(/data-slot="button"/);
  });

  it('SelectionBar: neutral actions and clear are flat members of the bar; a destructive action stays a coloured button', () => {
    const html = renderToStaticMarkup(
      <SelectionBar
        count={2}
        onClear={() => {}}
        onSelectAll={() => {}}
        actions={[
          { id: 'archive', label: 'Archive', onClick: () => {} },
          { id: 'delete', label: 'Delete', onClick: () => {}, variant: 'destructive' },
        ]}
      />,
    );
    expect(members(html)).toBe(3); // Select all, Archive, Clear
    expect(html.match(/data-slot="button"/g)).toHaveLength(1); // Delete
    expect(html).toContain('glass-chrome');
    expect(html).toContain('data-jelly-press-through=""');
  });

  it('ModelToggle: a radio group whose options are flat members, the chosen one glowing', () => {
    const html = renderToStaticMarkup(<ModelToggle value="chat" onChange={() => {}} />);
    expect(html.match(/data-slot="jelly-group"/g)).toHaveLength(1);
    expect(members(html)).toBe(2);
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)).toHaveLength(2);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/data-selected=""/g)).toHaveLength(1);
    expect(html).not.toContain('aria-pressed');
  });
});
