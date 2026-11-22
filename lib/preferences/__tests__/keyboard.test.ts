import { beforeEach, describe, expect, it, vi } from 'vitest';

// The keyboard preference is a member's own data and its body is the only input
// the server trusts from a client: unknown shortcut ids, malformed key strings,
// reserved combinations, collisions and oversized maps are all refused here, and
// a stored row is normalised before it is read back.

const row = vi.hoisted(() => ({
  current: null as { singleKeys: string; overrides: unknown } | null,
}));
const upsert = vi.hoisted(() =>
  vi.fn(async (args: { create: { singleKeys: string; overrides: unknown } }) => args.create),
);

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    keyboardPreference: {
      findUnique: vi.fn(async () => row.current),
      upsert,
    },
  },
}));

const { keyboardPrefsSchema } = await import('@/lib/preferences/keyboard-schema');
const { getKeyboardPrefs, saveKeyboardPrefs } = await import('@/lib/preferences/keyboard.server');

const parse = (overrides: Record<string, unknown>, singleKeys: unknown = 'on') =>
  keyboardPrefsSchema.safeParse({ singleKeys, overrides });

beforeEach(() => {
  row.current = null;
  upsert.mockClear();
});

describe('keyboardPrefsSchema', () => {
  it('accepts a mode and a valid remap', () => {
    expect(parse({}).success).toBe(true);
    expect(parse({ 'site.compose': ['n'] }, 'alt').success).toBe(true);
    expect(parse({ 'site.go.home': ['q', 'y'] }, 'off').success).toBe(true);
  });

  it('rejects an unknown mode', () => {
    expect(parse({}, 'sometimes').success).toBe(false);
  });

  it('rejects ids that are not site shortcuts', () => {
    expect(parse({ 'site.nope': ['n'] }).success).toBe(false);
    expect(parse({ 'altair.pause': ['p'] }).success).toBe(false);
  });

  it('rejects bad key strings', () => {
    for (const keys of [[], ['a', 'b', 'c'], [''], ['ctrl+n'], ['mod+'], ['two words'], ['x'.repeat(40)], [7]]) {
      expect(parse({ 'site.compose': keys }).success).toBe(false);
    }
  });

  it('rejects reserved browser combinations', () => {
    for (const keys of [['mod+w'], ['mod+t'], ['tab'], ['escape'], ['g', 'mod+q']]) {
      expect(parse({ 'site.compose': keys }).success).toBe(false);
    }
  });

  it('rejects a remap that collides with another shortcut', () => {
    expect(parse({ 'site.compose': ['/'] }).success).toBe(false);
    expect(parse({ 'site.compose': ['g'] }).success).toBe(false);
    expect(parse({ 'site.compose': ['n'], 'site.search': ['n'] }).success).toBe(false);
  });

  it('rejects more than 64 overrides', () => {
    const many = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`site.x${i}`, ['n']]));
    expect(parse(many).success).toBe(false);
  });
});

describe('keyboard preference storage', () => {
  it('returns the defaults when the member has no row', async () => {
    expect(await getKeyboardPrefs('u1')).toEqual({ singleKeys: 'on', overrides: {} });
  });

  it('drops stored overrides that no longer pass', async () => {
    row.current = {
      singleKeys: 'alt',
      overrides: { 'site.compose': ['n'], 'site.removed': ['q'], 'site.search': ['mod+w'] },
    };
    expect(await getKeyboardPrefs('u1')).toEqual({
      singleKeys: 'alt',
      overrides: { 'site.compose': ['n'] },
    });
  });

  it('upserts for the caller and returns the saved prefs', async () => {
    const saved = await saveKeyboardPrefs('u1', {
      singleKeys: 'off',
      overrides: { 'site.compose': ['n'] },
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
    expect(saved).toEqual({ singleKeys: 'off', overrides: { 'site.compose': ['n'] } });
  });
});
