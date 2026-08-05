import { describe, it, expect, afterEach } from 'vitest';
import {
  ALL_SHORTCUTS,
  SITE_SHORTCUTS,
  findShortcutConflicts,
  registerShortcuts,
  scopesOverlap,
  shortcutsForScope,
  type Shortcut,
  type ShortcutScope,
} from '@/lib/shortcuts/registry';

/**
 * ─────────── two shortcuts may not claim the same keystroke (B4) ───────────
 *
 * A keyboard shortcut collision is the quietest bug a UI can ship. Nothing
 * throws, nothing logs, and both handlers are "working" — the browser simply
 * runs whichever listener was attached first (or both, doing two things at
 * once). It is discovered by a user, in a bug report that reads "the compose
 * shortcut stopped working", weeks after the commit that broke it.
 *
 * Before `lib/shortcuts/registry.ts` there was no way to detect one even
 * deliberately: bindings lived in the component that installed them
 * (`components/site/KeyboardShortcuts.tsx`, `CommandPalette.tsx`, and each
 * full-screen game's own `keydown` handler), so "does `c` already mean
 * something?" had no answer short of grepping for `keydown` and reading every
 * hit. The registry makes the set enumerable; this test is the reason that
 * matters.
 *
 * The interesting half is the **prefix** case, which is not intuitive and is
 * where the real collisions come from. The site's navigation shortcuts are
 * sequences — `g` then `h` for home, `g` then `n` for notifications. Adding a
 * bare `g` for anything does not merely tie with them: it makes all eleven of
 * them unreachable, because the first key resolves immediately and the sequence
 * timer never gets to see the second. A test that only compared full key
 * sequences for equality would pass on that change and ship it.
 *
 * Scope is what keeps the check from crying wolf. Altair's `p` (pause) and the
 * feed's `g p` (progress) are never live on the same screen — games are
 * full-screen routes outside the `_site` shell — so they are not a conflict.
 * `global` is the exception that overlaps everything, which is exactly why very
 * little should be `global`: a `global` binding spends the keystroke everywhere
 * on the site at once, including inside every game.
 */

/** Registrations made by a test, torn down after it. */
let cleanup: Array<() => void> = [];

function register(list: Shortcut[]): void {
  cleanup.push(registerShortcuts(list));
}

afterEach(() => {
  for (const undo of cleanup.reverse()) undo();
  cleanup = [];
});

/** Minimal valid shortcut — every test overrides only what it is about. */
function shortcut(id: string, keys: string[], scope: ShortcutScope): Shortcut {
  return { id, keys, scope, labelKey: `test-${id}`, label: id, ns: 'feed' };
}

describe('the shipped shortcut set', () => {
  it('registers a non-trivial set', () => {
    // Guards the assertions below: an empty registry would make "no conflicts"
    // vacuously true, which is the failure mode of every static gate.
    expect(ALL_SHORTCUTS().length).toBeGreaterThanOrEqual(10);
    expect(SITE_SHORTCUTS.length).toBeGreaterThanOrEqual(10);
  });

  it('has no two shortcuts claiming the same key combination', () => {
    const conflicts = findShortcutConflicts();
    const detail = conflicts
      .map(
        (c) =>
          `  ${c.kind}: ${c.a.id} [${c.a.keys.join(' ')}] (${c.a.scope}) ` +
          `vs ${c.b.id} [${c.b.keys.join(' ')}] (${c.b.scope})`,
      )
      .join('\n');
    expect(
      conflicts,
      `\nShortcut conflicts:\n${detail}\n\n` +
        `Two shortcuts that can be live at the same time may not claim the same ` +
        `keystroke, and one may not be a PREFIX of the other — a bare \`g\` makes ` +
        `every \`g …\` navigation sequence unreachable. Pick a different key, or ` +
        `narrow the scope so the two are never live together (a game shortcut is ` +
        `\`game:<slug>\`, not \`global\`).\n`,
    ).toEqual([]);
  });

  it('gives every shortcut a unique id', () => {
    // Ids are the registry's primary key — `registerShortcuts` REPLACES on a
    // repeat id, so a duplicate does not collide loudly, it silently deletes the
    // other shortcut from the help sheet and from this conflict check.
    const ids = ALL_SHORTCUTS().map((s) => s.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `duplicate shortcut ids: ${dupes.join(', ')}`).toEqual([]);
  });

  it('gives every shortcut a non-empty binding and label key', () => {
    const broken = ALL_SHORTCUTS()
      .filter((s) => s.keys.length === 0 || s.keys.some((k) => k.trim() === '') || !s.labelKey)
      .map((s) => s.id);
    expect(
      broken,
      `\nShortcuts with an empty binding or no labelKey: ${broken.join(', ')}\n` +
        `An entry with no keys can never fire; one with no labelKey renders as a ` +
        `blank row in the help sheet.\n`,
    ).toEqual([]);
  });
});

describe('conflict detection catches the shapes that actually ship', () => {
  it('flags an exact duplicate in the same scope', () => {
    register([shortcut('test.dup.a', ['x'], 'feed'), shortcut('test.dup.b', ['x'], 'feed')]);
    const conflicts = findShortcutConflicts().filter((c) => c.a.id.startsWith('test.'));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe('duplicate');
  });

  it('flags a bare key that shadows an existing sequence', () => {
    // The real one: `g` on its own would eat `g h`, `g n`, `g m` … and the site
    // has eleven of those. This is the case a naive equality check misses.
    register([shortcut('test.prefix.bare', ['g'], 'feed')]);
    const conflicts = findShortcutConflicts().filter(
      (c) => c.a.id === 'test.prefix.bare' || c.b.id === 'test.prefix.bare',
    );
    expect(conflicts.length).toBeGreaterThanOrEqual(10);
    expect(conflicts.every((c) => c.kind === 'prefix')).toBe(true);
  });

  it('flags a `global` shortcut against a scoped one — global overlaps everything', () => {
    // The reason `global` should be rare: it spends the keystroke on every
    // screen of the site, including inside full-screen games.
    register([shortcut('test.global.x', ['q'], 'global'), shortcut('test.feed.x', ['q'], 'feed')]);
    const conflicts = findShortcutConflicts().filter((c) => c.a.id.startsWith('test.'));
    expect(conflicts).toHaveLength(1);
  });

  it('does NOT flag two non-global scopes that are never live together', () => {
    // Altair's pause and Vega's pause are the same key on two screens that
    // cannot both exist. Reporting that would train people to ignore the check.
    register([
      shortcut('test.altair.pause', ['p'], 'game:altair'),
      shortcut('test.vega.pause', ['p'], 'game:vega'),
    ]);
    expect(findShortcutConflicts().filter((c) => c.a.id.startsWith('test.'))).toEqual([]);
  });

  it('normalises modifier order — `mod+shift+k` is `shift+mod+k`', () => {
    // Otherwise the same binding written two ways passes the check and then
    // fires two handlers at runtime, which is worse than either failing.
    register([
      shortcut('test.mod.a', ['mod+shift+k'], 'feed'),
      shortcut('test.mod.b', ['shift+mod+k'], 'feed'),
    ]);
    const conflicts = findShortcutConflicts().filter((c) => c.a.id.startsWith('test.'));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe('duplicate');
  });

  it('treats a modified key as distinct from the bare key', () => {
    // `mod+k` (command palette) must not be reported against a plain `k`, or
    // every browser-standard chord would look like a collision.
    register([shortcut('test.bare.k', ['k'], 'feed'), shortcut('test.mod.k', ['mod+k'], 'feed')]);
    expect(findShortcutConflicts().filter((c) => c.a.id.startsWith('test.'))).toEqual([]);
  });
});

describe('scope resolution', () => {
  it('overlaps a scope with itself and with global, and nothing else', () => {
    expect(scopesOverlap('feed', 'feed')).toBe(true);
    expect(scopesOverlap('global', 'game:altair')).toBe(true);
    expect(scopesOverlap('game:altair', 'global')).toBe(true);
    expect(scopesOverlap('feed', 'game:altair')).toBe(false);
    expect(scopesOverlap('game:altair', 'game:vega')).toBe(false);
  });

  it('lists a scope as its own shortcuts plus the global ones', () => {
    register([shortcut('test.scoped.only', ['z'], 'game:altair')]);
    const inGame = shortcutsForScope('game:altair').map((s) => s.id);
    expect(inGame).toContain('test.scoped.only');
    // `mod+k` is the site's one `global` binding — it survives into a game.
    expect(inGame).toContain('site.palette');
    // …and the feed-scoped ones do not.
    expect(inGame).not.toContain('site.compose');
  });

  it('honours a `when` guard so the help sheet never lists an inert shortcut', () => {
    register([{ ...shortcut('test.guarded', ['y'], 'feed'), when: () => false }]);
    expect(shortcutsForScope('feed').map((s) => s.id)).not.toContain('test.guarded');
  });
});
