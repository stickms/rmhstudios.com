/**
 * A printed `@handle` is wrapped in `<Handle>` (`components/ui/handle.tsx`, a
 * `<bdi>`), so the `@` stays first in a right-to-left page.
 *
 * Printed bare, the bidirectional algorithm moves the `@` to the end
 * (`playerone@`). Counted forms, all as an element's text:
 *  - `>@{user.handle}`, on the tag's line or the next (`>\n  @{handle}`);
 *  - a template literal as the first child expression (`>{h ? `@${h}` : name}`);
 *  - string concatenation (`'@' + handle`).
 * A template literal in an attribute (`title={`@${h}`}`) is not counted: an
 * attribute cannot hold a `<bdi>`. One-directional ratchet:
 *  - a new bare print fails (count above BASELINE): use `<Handle handle={…} />`;
 *  - converting one fails too until BASELINE is lowered to the new count.
 *
 * Not counted: a print already inside `<bdi …>` (isolated), tests, and
 * `components/velum2099/game/` (the `@ts-nocheck` area, out of scope).
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Lower this when you convert call sites. Never raise it. The 3 left: a handle
 * joined into one string with pronouns and place (`components/steam/ProfilePage.tsx`),
 * an `<option>`'s text, which cannot hold a `<bdi>`
 * (`components/communities/AdminOwnedCommunities.tsx`), and `'@' + handle` inside
 * an interpolated byline (`components/feed/DeckMarketplaceColumn.tsx`).
 */
const BASELINE = 3;

/**
 * The opening tag (group 1, to skip a `<bdi …>`), then the bare print: `@{` as
 * text, or a first child expression holding a `` `@${ `` template literal.
 */
const RAW = /(<bdi\b[^>]*)?>\s*(?:@\{|\{[^{}\n]*`@\$\{)/g;
/** `'@' + handle` (or `"@" +`), anywhere in a component. */
const CONCAT = /['"]@['"]\s*\+/g;

function count(): { total: number; files: [string, number][] } {
  const files = globSync('{app,components,features}/**/*.tsx', {
    exclude: (f) => /node_modules|__tests__|\.test\.|routeTree\.gen|components\/velum2099\/game\//.test(String(f)),
  });
  let total = 0;
  const per: [string, number][] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const n = [...src.matchAll(RAW)].filter((m) => m[1] === undefined).length + (src.match(CONCAT) ?? []).length;
    if (n) {
      total += n;
      per.push([String(f), n]);
    }
  }
  per.sort((a, b) => b[1] - a[1]);
  return { total, files: per };
}

describe('handle direction ratchet', () => {
  it('does not grow and is lowered as it shrinks', () => {
    const { total, files } = count();
    expect(
      total,
      `bare handle prints: ${total}, baseline ${BASELINE}.\n` +
        (total > BASELINE
          ? "  Print a handle with <Handle handle={…} /> from '@/components/ui/handle' so it reads @name in Arabic.\n"
          : `  You converted some: lower BASELINE in this file to ${total}.\n`) +
        `  Remaining: ${files.map(([f, n]) => `${f} (${n})`).join(', ')}`,
    ).toBe(BASELINE);
  });
});
