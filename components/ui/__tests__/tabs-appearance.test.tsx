import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiquidTabs } from '../liquid-tabs';
import { AppTierContext } from '../app-tier-context';

const tabs = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
];

describe('LiquidTabs appearance', () => {
  it('is the flat glow on the main site by default, and its tabs are flat members', () => {
    const html = renderToStaticMarkup(<LiquidTabs tabs={tabs} value="a" aria-label="t" />);
    expect(html).toContain('data-tab-appearance="glow"');
    // The strip is one opted-out subtree: no tab inside it is a jelly body, whichever element a caller renders.
    expect(html).toContain('data-jelly-scope="off"');
    expect(html).not.toContain('data-fluid-press');
  });

  it('keeps the raised thumb, and its pressable tabs, when a game or app asks for it', () => {
    const html = renderToStaticMarkup(
      <LiquidTabs tabs={tabs} value="a" aria-label="t" appearance="thumb" />,
    );
    expect(html).toContain('data-tab-appearance="thumb"');
    expect(html.match(/data-fluid-press=""/g)).toHaveLength(2);
    expect(html).not.toContain('data-jelly-scope');
  });

  it('defaults to the raised thumb on a game/app route, with its pressable tabs untouched', () => {
    const html = renderToStaticMarkup(
      <AppTierContext.Provider value={true}>
        <LiquidTabs tabs={tabs} value="a" aria-label="t" />
      </AppTierContext.Provider>,
    );
    expect(html).toContain('data-tab-appearance="thumb"');
    expect(html.match(/data-fluid-press=""/g)).toHaveLength(2);
    expect(html).not.toContain('data-jelly-scope');
  });

  it('an explicit appearance beats the route', () => {
    const html = renderToStaticMarkup(
      <AppTierContext.Provider value={true}>
        <LiquidTabs tabs={tabs} value="a" aria-label="t" appearance="glow" />
      </AppTierContext.Provider>,
    );
    expect(html).toContain('data-tab-appearance="glow"');
  });

  it('keeps its ARIA contract in both appearances', () => {
    for (const appearance of ['glow', 'thumb'] as const) {
      const html = renderToStaticMarkup(
        <LiquidTabs tabs={tabs} value="b" aria-label="t" appearance={appearance} />,
      );
      expect(html).toMatch(/aria-selected="true"[^>]*>[\s\S]*Beta/);
      expect(html.match(/aria-selected="false"/g)).toHaveLength(1);
    }
  });

  it('link mode marks the current route with aria-current and stays inside the opted-out strip', () => {
    const html = renderToStaticMarkup(
      <LiquidTabs
        tabs={tabs}
        value="a"
        aria-label="t"
        renderTab={(tab, props) => (
          <a
            href={`/${tab.id}`}
            id={props.id}
            aria-current={props['aria-current']}
            className={props.className}
            data-fluid-press={props['data-fluid-press']}
          >
            {props.children}
          </a>
        )}
      />,
    );
    expect(html).toContain('<nav');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('data-jelly-scope="off"');
    expect(html).not.toContain('data-fluid-press');
  });
});
