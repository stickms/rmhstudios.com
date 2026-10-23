/** Floating surfaces must retarget on interruption and finish before unmount. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POP_COLLAPSE_MS } from '@/lib/motion';
const CSS = readFileSync(join(__dirname, '../../app/globals.css'), 'utf8');
const DIALOG = readFileSync(join(__dirname, '../../components/ui/dialog.css'), 'utf8');

describe('reversible floating surfaces', () => {
  it('changes opacity and independent scale without replacing positioning transforms', () => {
    const start = CSS.indexOf('/* Transitions retarget');
    const end = CSS.indexOf('@keyframes motion-presence', start);
    const rules = CSS.slice(start, end);
    expect(rules).toContain('transition:');
    expect(rules).toContain('scale: 0.98');
    expect(rules).toContain('@starting-style');
    expect(rules).not.toMatch(/transform:|rotate:|clip-path:/);
  });
  it('lets Radix Presence wait for the transition without animating a second property', () => {
    expect(CSS).toMatch(/animation: motion-presence var\(--motion-collapse\)/);
    expect(CSS).toMatch(/@keyframes motion-presence\s*\{\s*from\s*\{\s*visibility: visible/);
    expect(DIALOG).toContain('animation: ui-dialog-presence var(--motion-out)');
  });
  it('keeps the React exit lifetime equal to the CSS close duration', () => {
    const collapse = /--motion-collapse:\s*([\d.]+)s/.exec(CSS);
    expect(collapse).not.toBeNull();
    expect(Math.round(Number(collapse![1]) * 1000)).toBe(POP_COLLAPSE_MS);
  });
  it('dialogs open and close on the same scale with the scrim fading alongside', () => {
    expect(DIALOG).toContain('@starting-style');
    expect(DIALOG.match(/scale: 0.98/g)).toHaveLength(2);
    expect(DIALOG).not.toMatch(/transform:|translateY|rotate/);
  });
});
