import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('page transitions are wired into the shell', () => {
  const shell = read('components/radial/RadialShell.tsx');

  it('the shell takes its layout group from the shared helper, not a private regex', () => {
    expect(shell).toContain("from '@/lib/page-transition'");
    expect(shell).toMatch(/shellLayoutFor\(renderedPathname\)/);
    expect(shell).not.toMatch(/store\|games\|apps\|create\|library/);
  });

  it('each committed page finishes its own entrance animations before paint, and ends the leave', () => {
    expect(shell).toMatch(/useLayoutEffect\(/);
    expect(shell).toMatch(/finishEntranceAnimations\(/);
    expect(shell).toMatch(/armEntranceGuard\(/);
    expect(shell).toMatch(/commitPageTransition\(\)/);
  });

  it('the router installs the navigation markers once, in the browser', () => {
    const router = read('app/router.tsx');
    expect(router).toContain('installPageTransitions(router)');
  });

  it('the loading skeleton (a slow navigation) does not replay its own heading rise either', () => {
    const pending = read('components/ui/RoutePending.tsx');
    expect(pending).toContain("from '@/lib/page-transition'");
    expect(pending).toMatch(/useLayoutEffect\(/);
    expect(pending).toMatch(/finishEntranceAnimations\(/);
  });
});
