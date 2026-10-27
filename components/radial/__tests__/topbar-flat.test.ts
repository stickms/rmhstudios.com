import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('../RadialShell.tsx', import.meta.url), 'utf8');
const bar = src.slice(src.indexOf('function RadialTopBar'), src.indexOf('interface RadialShellProps'));

describe('top bar members are flat', () => {
  it('keeps the bar as the one glass body', () => {
    expect(bar).toMatch(/<header className="radial-topbar glass-chrome">/);
  });

  it('presses no member as a body of its own', () => {
    expect(bar).not.toContain('data-fluid-press');
  });

  it('builds every bar control from JellyGroup.Item', () => {
    expect(bar).not.toMatch(/<button[^>]*className="radial-topbar__btn[^"]*"\n/);
    expect(bar.match(/<JellyGroup\.Item/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
