import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { MUTE_EXEMPT_PATHS, MUTE_READ_PATHS } from '@/lib/moderation/mute-expiry';

/**
 * Every reader of `userMute` goes through `activeMuteWhere` (s10-10). A new file that touches the table must use the
 * predicate and be listed in MUTE_READ_PATHS, or be exempted in MUTE_EXEMPT_PATHS with a reason.
 */

/** Comments do not count: a reader that only names the predicate in a comment must fail. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const code = (file: string) => stripComments(readFileSync(file, 'utf8'));
const touchesMutes = (src: string) => /\buserMute\b/.test(src);

function sourceFilesTouchingMutes(): string[] {
  const out = execFileSync('git', ['grep', '-l', '-w', 'userMute', '--', '*.ts', '*.tsx'], { encoding: 'utf8' });
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.includes('__tests__/') && !f.endsWith('.test.ts') && !f.startsWith('prisma/'));
}

describe('MUTE_READ_PATHS', () => {
  it('lists the nine readers', () => {
    expect(MUTE_READ_PATHS).toHaveLength(9);
  });

  it.each([...MUTE_READ_PATHS])('%s exists, reads userMute and applies activeMuteWhere', (file) => {
    expect(existsSync(file)).toBe(true);
    const src = code(file);
    expect(touchesMutes(src)).toBe(true);
    expect(src).toMatch(/\bactiveMuteWhere\(/);
    expect(src).toContain("from '@/lib/moderation/mute-expiry'");
  });

  it('every other file that touches userMute is exempt, with a reason', () => {
    const known = new Set<string>([...MUTE_READ_PATHS, ...Object.keys(MUTE_EXEMPT_PATHS)]);
    const unknown = sourceFilesTouchingMutes().filter((f) => !known.has(f) && touchesMutes(code(f)));
    expect(unknown).toEqual([]);
    for (const [file, reason] of Object.entries(MUTE_EXEMPT_PATHS)) {
      expect(existsSync(file)).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it('no reader filters expiry by hand instead of using the predicate', () => {
    for (const file of MUTE_READ_PATHS) {
      expect(code(file)).not.toMatch(/expiresAt:\s*\{\s*gt/);
    }
  });
});

describe('the comment stripper', () => {
  it('drops a predicate that is only named in a comment', () => {
    expect(stripComments('// activeMuteWhere(now)\nconst a = 1;')).not.toContain('activeMuteWhere');
    expect(stripComments('/* activeMuteWhere( */ const a = 1;')).not.toContain('activeMuteWhere');
    expect(stripComments("import x from '@/lib/a'; activeMuteWhere(n)")).toContain('activeMuteWhere(n)');
  });
});
