import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The route-progress bar creeps toward 90% on one CSS transition. It used to be a `setInterval` that set React state
 * every 160ms for as long as a navigation was pending.
 */
const read = (p: string) => readFileSync(join(__dirname, '../../..', p), 'utf8');

describe('NavigationProgress', () => {
  const src = read('components/ui/NavigationProgress.tsx');

  it('has no interval and no per-tick state: three phases, changed three times per navigation', () => {
    expect(src).not.toMatch(/setInterval\(/);
    expect(src).not.toContain('setProgress');
    expect(src).toContain("type Phase = 'idle' | 'running' | 'done';");
    expect(src).toContain('data-phase={phase}');
  });

  it('is still out of the box tree while idle (iOS 26 reads a fixed top-edge element as the status-bar tint)', () => {
    expect(src).toContain("phase === 'idle' ? 'hidden' : 'block'");
  });

  it('creeps on one transition, starts from 8% via @starting-style, and snaps to 100% when done', () => {
    const css = read('app/globals.css');
    const running = css.slice(css.indexOf("[data-nav-progress][data-phase='running'] {"));
    expect(running).toContain('transform: scaleX(0.9)');
    // The crawl curve is the --ease-crawl token since E7 (one motion source).
    expect(running).toMatch(/transition: transform 3\.2s var\(--ease-crawl\)/);
    expect(css).toMatch(/@starting-style \{\s*\[data-nav-progress\]\[data-phase='running'\] \{\s*transform: scaleX\(0\.08\)/);
    expect(css).toMatch(/\[data-nav-progress\]\[data-phase='done'\] \{\s*transform: scaleX\(1\)/);
  });
});
