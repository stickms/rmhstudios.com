// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import { PuzzlePlayedElsewhere } from '../PuzzleShell';
import {
  hasAlibiResult,
  hasChainlinkResult,
  hasOutcastResult,
  hasSpectrumResult,
} from '@/lib/daily-puzzles/result-shapes';

describe('played on another device', () => {
  it('shows the score and time only, with no guesses to replay', () => {
    const html = renderToStaticMarkup(<PuzzlePlayedElsewhere score={150} timeSeconds={83} />);
    expect(html).toContain('Played on another device');
    expect(html).toContain('150');
    expect(html).toContain('1:23');
    expect(html).not.toMatch(/Cold Case|Case Closed|Chain Broken|Chain Complete/);
  });

  it('leaves the time out when none was saved', () => {
    const html = renderToStaticMarkup(<PuzzlePlayedElsewhere score={60} timeSeconds={null} />);
    expect(html).toContain('60');
    expect(html).not.toContain('>time<');
  });

  it('is the state each board enters when a saved score has no result', () => {
    // The boards open this state exactly when their `has…Result` check fails on the stored field.
    for (const stored of [null, undefined, {}]) {
      expect(hasAlibiResult(stored)).toBe(false);
      expect(hasChainlinkResult(stored)).toBe(false);
      expect(hasOutcastResult(stored)).toBe(false);
      expect(hasSpectrumResult(stored)).toBe(false);
    }
  });
});
