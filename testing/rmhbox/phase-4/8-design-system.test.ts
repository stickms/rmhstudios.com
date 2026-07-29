/**
 * Phase 4 §8 — UI Design System Tests
 *
 * RMHbox's design system is now two files: the shared app chrome
 * (`components/shared/app-theme.css`), which owns the `--app-*` contract and
 * the neutral ramp, and RMHbox's palette (`components/rmhbox/rmhbox.css`),
 * which declares the hues that make it RMHbox. These tests assert against the
 * composed system — the guarantee is unchanged (every token the components
 * read resolves), it just isn't in one file any more.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p: string) => readFileSync(resolve(__dirname, '../../../', p), 'utf-8');

const sharedCss = read('components/shared/app-theme.css');
const paletteCss = read('components/rmhbox/rmhbox.css');
const cssContent = `${sharedCss}\n${paletteCss}`;

/** Every `--app-*` token the RMHbox components consume. */
const REQUIRED_TOKENS = [
  'bg',
  'bg-subtle',
  'surface',
  'surface-hover',
  'surface-active',
  'border',
  'border-bright',
  'text',
  'text-muted',
  'text-dim',
  'accent',
  'accent-fg',
  'accent-hover',
  'accent-dim',
  'success',
  'success-dim',
  'danger',
  'danger-dim',
  'warning',
  'warning-dim',
  'info',
  'info-dim',
  'rare',
  'rare-dim',
  'font-display',
  'font-body',
  'font-mono',
  'shadow',
  'radius',
  'radius-sm',
  'toast-bg',
];

describe('UI Design System (§8)', () => {
  it.each(REQUIRED_TOKENS)('defines --app-%s', (token) => {
    expect(cssContent).toContain(`--app-${token}:`);
  });

  it('pulls the shared chrome into the palette file', () => {
    expect(paletteCss).toMatch(/@import\s+['"]\.\.\/shared\/app-theme\.css['"]/);
  });

  it('uses Inter for the display and body faces', () => {
    expect(sharedCss).toMatch(/--app-font-display:.*Inter/);
    expect(sharedCss).toMatch(/--app-font-body:.*Inter/);
  });

  it('uses JetBrains Mono for the mono face', () => {
    expect(sharedCss).toMatch(/--app-font-mono:.*JetBrains Mono/);
  });

  it('keeps RMHbox on its own accent and rarity hues', () => {
    expect(paletteCss).toContain('#6ea8d9');
    expect(paletteCss).toContain('#b58ad9');
  });

  it('inherits the neutral ground from the shared ramp', () => {
    expect(sharedCss).toContain('#1a1b1e');
  });

  it('pairs every accent fill with its own ink', () => {
    // A palette that sets an accent without `--app-accent-fg` inherits the
    // previous one's ink, which is how you ship an invisible button.
    const accents = [...paletteCss.matchAll(/--app-accent:\s*[^;]+;/g)].length;
    const inks = [...paletteCss.matchAll(/--app-accent-fg:\s*[^;]+;/g)].length;
    expect(accents).toBeGreaterThan(0);
    expect(inks).toBe(accents);
  });
});
