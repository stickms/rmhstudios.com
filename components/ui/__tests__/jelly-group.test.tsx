import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { JellyGroup } from '../jelly-group';

describe('JellyGroup', () => {
  it('renders the parent as the only body, on the fill role by default', () => {
    const html = renderToStaticMarkup(
      <JellyGroup>
        <JellyGroup.Item>A</JellyGroup.Item>
        <JellyGroup.Item>B</JellyGroup.Item>
      </JellyGroup>,
    );
    expect(html).toContain('data-slot="jelly-group"');
    expect(html).toMatch(/class="[^"]*glass-fill/);
  });

  it('takes the chrome role for sticky bars', () => {
    const html = renderToStaticMarkup(
      <JellyGroup surface="chrome">
        <JellyGroup.Item>A</JellyGroup.Item>
      </JellyGroup>,
    );
    expect(html).toMatch(/class="[^"]*glass-chrome/);
  });

  it('opts every member out of the per-control body', () => {
    const html = renderToStaticMarkup(
      <JellyGroup>
        <JellyGroup.Item>A</JellyGroup.Item>
        <JellyGroup.Item>B</JellyGroup.Item>
      </JellyGroup>,
    );
    expect(html.match(/data-jelly="off"/g)).toHaveLength(2);
    expect(html.match(/data-evert=""/g)).toHaveLength(2);
  });

  it('marks the selected member and only that one', () => {
    const html = renderToStaticMarkup(
      <JellyGroup>
        <JellyGroup.Item selected>A</JellyGroup.Item>
        <JellyGroup.Item selected={false}>B</JellyGroup.Item>
      </JellyGroup>,
    );
    expect(html.match(/data-selected=""/g)).toHaveLength(1);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('is not a toggle unless asked: no aria-pressed without a selected prop', () => {
    const html = renderToStaticMarkup(
      <JellyGroup>
        <JellyGroup.Item>Opens a panel</JellyGroup.Item>
      </JellyGroup>,
    );
    expect(html).not.toContain('aria-pressed');
  });

  it('never marks a disabled member selected', () => {
    const html = renderToStaticMarkup(
      <JellyGroup>
        <JellyGroup.Item selected disabled>
          A
        </JellyGroup.Item>
      </JellyGroup>,
    );
    expect(html).not.toContain('data-selected');
  });

  it('lets a link be a member and leaves selection to its own aria-current', () => {
    const html = renderToStaticMarkup(
      <JellyGroup>
        <JellyGroup.Item asChild>
          <a href="/x" aria-current="page">
            X
          </a>
        </JellyGroup.Item>
      </JellyGroup>,
    );
    expect(html).toContain('<a ');
    expect(html).toContain('data-jelly="off"');
    expect(html).not.toContain('aria-pressed');
  });

  it('renders a one-member group without throwing', () => {
    expect(() =>
      renderToStaticMarkup(
        <JellyGroup>
          <JellyGroup.Item>Only</JellyGroup.Item>
        </JellyGroup>,
      ),
    ).not.toThrow();
  });
});
