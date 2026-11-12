import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Tabs } from '../tabs';
import { AppTierContext } from '../app-tier-context';

const tabs = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
];

describe('Tabs (Steel K5)', () => {
  it('is words on a rule on the site: one appearance, no thumb, no track, no press body', () => {
    const html = renderToStaticMarkup(<Tabs tabs={tabs} value="a" aria-label="t" />);
    expect(html).toContain('data-tab-appearance="rule"');
    expect(html).not.toContain('data-tab-capsule');
    expect(html).not.toContain('data-tab-thumb');
    expect(html).not.toContain('liquid-tabs-sheet');
    expect(html).not.toContain('data-fluid-press');
    expect(html).not.toContain('data-jelly');
  });

  it('marks the active tab with a 2px ink underline, and the strip carries no icons', () => {
    const html = renderToStaticMarkup(
      <Tabs tabs={[{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]} value="b" aria-label="t" />,
    );
    // Exactly one item shows the underline (A2: state is never colour alone).
    expect(html.match(/after:opacity-100/g)).toHaveLength(1);
    expect(html.match(/after:opacity-0/g)).toHaveLength(1);
    expect(html).toContain('after:h-0.5');
    expect(html).toContain('after:bg-site-text');
  });

  it('keeps the raised thumb on a game/app route (L8)', () => {
    const html = renderToStaticMarkup(
      <AppTierContext.Provider value={true}>
        <Tabs tabs={tabs} value="a" aria-label="t" />
      </AppTierContext.Provider>,
    );
    expect(html).toContain('data-tab-appearance="thumb"');
    expect(html).toContain('data-tab-capsule');
    expect(html).toContain('liquid-tabs-sheet');
  });

  it('keeps its ARIA contract in both tiers', () => {
    for (const app of [false, true]) {
      const html = renderToStaticMarkup(
        <AppTierContext.Provider value={app}>
          <Tabs tabs={tabs} value="b" aria-label="t" />
        </AppTierContext.Provider>,
      );
      expect(html).toMatch(/aria-selected="true"[^>]*>[\s\S]*Beta/);
      expect(html.match(/aria-selected="false"/g)).toHaveLength(1);
    }
  });

  it('link mode marks the current route with aria-current and draws the rule underline on the wrapper', () => {
    const html = renderToStaticMarkup(
      <Tabs
        tabs={tabs}
        value="a"
        aria-label="t"
        renderTab={(tab, props) => (
          <a href={`/${tab.id}`} id={props.id} aria-current={props['aria-current']} className={props.className}>
            {props.children}
          </a>
        )}
      />,
    );
    expect(html).toContain('<nav');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.match(/after:opacity-100/g)).toHaveLength(1);
    expect(html).not.toContain('data-fluid-press');
  });
});
