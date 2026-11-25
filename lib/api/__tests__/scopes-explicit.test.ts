import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_SCOPES, SCOPES, WILDCARD_SCOPES, hasScope, normalizeScopes, scopesByGroup } from '@/lib/api/scopes';

/** s10-13: a scope marked `explicit` is granted only when a key lists it; every other scope is unchanged. */
const explicit = SCOPES.filter((s) => s.explicit);
const ordinary = SCOPES.filter((s) => !s.explicit);

describe('explicit scopes', () => {
  it('manage:moderation and write:study-reviews are the explicit scopes', () => {
    expect(explicit.map((s) => s.id)).toEqual(['manage:moderation', 'write:study-reviews']);
  });

  it('ignore * and the action wildcard, and need a literal entry', () => {
    for (const s of explicit) {
      expect(hasScope(['*'], s.id)).toBe(false);
      expect(hasScope([`${s.action}:*`], s.id)).toBe(false);
      expect(hasScope(['*', 'read:*', 'write:*', 'manage:*'], s.id)).toBe(false);
      expect(hasScope([s.id], s.id)).toBe(true);
      expect(hasScope(['*', s.id], s.id)).toBe(true);
    }
  });

  it('does not make the key lose anything else when listed beside a wildcard', () => {
    expect(hasScope(['*', 'manage:moderation'], 'manage:webhooks')).toBe(true);
    expect(hasScope(['manage:moderation'], 'manage:events')).toBe(false);
  });

  it('every other scope still matches * and its own action wildcard, and nothing else', () => {
    for (const s of ordinary) {
      expect(hasScope(['*'], s.id), s.id).toBe(true);
      expect(hasScope([`${s.action}:*`], s.id), s.id).toBe(true);
      expect(hasScope([s.id], s.id), s.id).toBe(true);
      const other = (['read', 'write', 'manage'] as const).find((a) => a !== s.action) as string;
      expect(hasScope([`${other}:*`], s.id), s.id).toBe(false);
    }
  });

  it('is still a real catalog scope and a valid stored value', () => {
    expect(ALL_SCOPES).toContain('manage:moderation');
    expect(normalizeScopes(['manage:moderation', '*'])).toEqual(['manage:moderation', '*']);
  });

  it('"All" in the key pickers leaves it out', () => {
    expect(WILDCARD_SCOPES).not.toContain('manage:moderation');
    expect(WILDCARD_SCOPES).toHaveLength(ordinary.length);
    expect(scopesByGroup().some((g) => g.scopes.some((s) => s.id === 'manage:moderation'))).toBe(true);
  });
});

describe('the key pickers', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  it.each(['components/developer/KeysManager.tsx', 'components/developer/TestKeyCreator.tsx'])(
    '%s grants "All" from the wildcard list, never from the whole catalog',
    (rel) => {
      const src = read(rel);
      expect(src).toContain('WILDCARD_SCOPES');
      expect(src).not.toMatch(/SCOPES\.map\(/);
    },
  );

  it('the creation form says why the explicit scope is unticked', () => {
    expect(read('components/developer/KeysManager.tsx')).toContain("t('keys-scope-explicit'");
    expect(read('locales/en/f-devplatform.json')).toContain(
      '"keys-scope-explicit": "Not included in “All”: choose it on its own"',
    );
  });
});
