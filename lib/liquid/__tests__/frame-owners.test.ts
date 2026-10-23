/**
 * #989 performance contract: one frame driver, one pointer fan-out. The glass engine and the fallback cursor light
 * take their frames from `drive()` (`lib/jelly/frame.ts`) and their pointer input from `onJellyPointer`
 * (`lib/jelly/pointer.ts`); neither owns an animation-frame loop or window/document pointer listeners of its own.
 * Comments are stripped first, so a file may still DOCUMENT what it does not own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const code = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe.each(['lib/liquid/glass/engine.ts', 'lib/liquid/runtime.ts'])('%s', (file) => {
  const src = code(file);

  it('never calls requestAnimationFrame (frames come from the one jelly driver)', () => {
    expect(src).not.toContain('requestAnimationFrame');
    expect(src).not.toContain('cancelAnimationFrame');
    expect(src).toMatch(/from '@\/lib\/jelly\/frame'/);
    expect(src).toMatch(/\bdrive\(/);
  });

  it('adds no pointer listeners of its own (input comes from the jelly pointer hub)', () => {
    expect(src).not.toMatch(/addEventListener\(\s*'pointer/);
    expect(src).toMatch(/from '@\/lib\/jelly\/pointer'/);
    expect(src).toMatch(/onJellyPointer\('pointermove'/);
  });
});

describe('engine frame order', () => {
  it('registers on the shared loop at order 20 (after physics, before arcs)', () => {
    expect(code('lib/liquid/glass/engine.ts')).toContain('drive(frame, { order: 20 }');
  });
});
