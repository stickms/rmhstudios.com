/**
 * #989 performance contract: one frame driver, one pointer fan-out. The pointer-variable service
 * (`lib/jelly/pointer-vars.ts`) takes its frames from `drive()` (`lib/jelly/frame.ts`) and its pointer input from
 * `onJellyPointer` (`lib/jelly/pointer.ts`); the click-arc renderer takes its frames from `drive()` too. Neither owns
 * an animation-frame loop, and the pointer-variable service owns no window pointer listeners of its own. Comments are
 * stripped first, so a file may still DOCUMENT what it does not own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const code = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe.each(['lib/jelly/pointer-vars.ts', 'lib/jelly/arcs/renderer.ts'])('%s', (file) => {
  const src = code(file);

  it('never calls requestAnimationFrame (frames come from the one jelly driver)', () => {
    expect(src).not.toContain('requestAnimationFrame');
    expect(src).not.toContain('cancelAnimationFrame');
    expect(src).toMatch(/from '(@\/lib\/jelly|\.\.?)\/frame'/);
    expect(src).toMatch(/\bdrive\(/);
  });
});

describe('lib/jelly/pointer-vars.ts', () => {
  const src = code('lib/jelly/pointer-vars.ts');

  it('adds no pointer listeners of its own (input comes from the jelly pointer hub)', () => {
    expect(src).not.toMatch(/addEventListener\(\s*'pointer/);
    expect(src).toMatch(/from '\.\/pointer'/);
    expect(src).toMatch(/onJellyPointer\('pointermove'/);
  });
});
