import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The coin economy as an EXECUTABLE gate.
 *
 * The economy grew by accretion: each new feature that needed coins wrote its
 * own balance arithmetic, and by the time this gate was written there were ~50
 * hand-rolled mutation sites across 30 files. Most were correct. A few were not
 * — two did read-then-decrement (a double-spend under READ COMMITTED), several
 * wrote no ledger row at all, and three double-counted the payer by recording
 * them on both sides of the same sale. None of that is visible on inspection,
 * which is exactly why review didn't catch it.
 *
 * So the rule is enforced by CI rather than by attention, in the same spirit as
 * `design-consistency.test.ts`:
 *
 *   1. `UserProfile.coins` may only be mutated inside the sanctioned modules.
 *   2. Nothing outside them may write a `coinTransaction` row — a balance change
 *      and its ledger row must be created together or they drift apart.
 *   3. No negative `amount` on a ledger row. Direction is carried by which of
 *      senderId/recipientId is null; a negative amount is a third encoding that
 *      breaks every sum over the table (and the database CHECK constraint added
 *      in the ledger migration now rejects it anyway).
 *
 * The allowlist is the point of control. Adding a file to it is a deliberate,
 * reviewable act; adding a mutation is not.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ['lib', join('app', 'routes'), 'server'];
const POINTER =
  'Move coin movement into lib/economy/ledger.server.ts (creditCoins / debitCoins / ' +
  'transferCoins). It keeps the balance guard inside the UPDATE, writes the ledger row, ' +
  'and supports idempotency keys.';

/**
 * Files permitted to mutate `UserProfile.coins` directly.
 *
 * - `lib/economy/ledger.server.ts` — the sanctioned implementation.
 * - `lib/wager/escrow.server.ts` — the escrow primitives. Already correct
 *   (conditional update + integer validation) and always paired with
 *   `recordWagerTxn`, which writes the ledger row. Kept separate because escrow
 *   is a two-phase hold/settle flow rather than a single movement.
 *
 * NEW ENTRIES ARE NOT EXPECTED. If a feature needs coins, it needs the ledger.
 */
const BALANCE_ALLOW = new Set([
  join('lib', 'economy', 'ledger-core.ts'),
  join('lib', 'economy', 'ledger.server.ts'),
  join('lib', 'wager', 'escrow.server.ts'),
]);

/**
 * Files permitted to write `coinTransaction` rows directly. Same two modules,
 * plus the legacy `awardCoins` shim which delegates to the ledger.
 */
const LEDGER_ALLOW = new Set([
  join('lib', 'economy', 'ledger-core.ts'),
  join('lib', 'economy', 'ledger.server.ts'),
  join('lib', 'wager', 'escrow.server.ts'),
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '__tests__' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const FILES = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))).map((f) => relative(ROOT, f));

/** Read a file, returning its lines with 1-based numbers. */
function lines(file: string): { n: number; text: string }[] {
  return readFileSync(join(ROOT, file), 'utf8')
    .split('\n')
    .map((text, i) => ({ n: i + 1, text }));
}

describe('coin economy consistency', () => {
  it('rule 1: only the ledger modules mutate UserProfile.coins', () => {
    // `coins:` followed by an increment/decrement operation is a balance write.
    const pattern = /coins:\s*\{\s*(increment|decrement)/;
    const offenders: string[] = [];

    for (const file of FILES) {
      if (BALANCE_ALLOW.has(file)) continue;
      for (const { n, text } of lines(file)) {
        if (pattern.test(text)) offenders.push(`${file}:${n}`);
      }
    }

    expect(offenders, `Direct coin-balance mutation outside the ledger.\n${POINTER}`).toEqual([]);
  });

  it('rule 2: only the ledger modules write coinTransaction rows', () => {
    const pattern = /coinTransaction\.(create|createMany|update|updateMany|upsert|delete)/;
    const offenders: string[] = [];

    for (const file of FILES) {
      if (LEDGER_ALLOW.has(file)) continue;
      for (const { n, text } of lines(file)) {
        if (pattern.test(text)) offenders.push(`${file}:${n}`);
      }
    }

    expect(
      offenders,
      `Ledger rows written outside the ledger module — a balance change and its row must be ` +
        `created together.\n${POINTER}`
    ).toEqual([]);
  });

  it('rule 3: no negative ledger amounts anywhere', () => {
    // `amount: -foo` / `amount: -1` — the obsolete third encoding for a sink.
    const pattern = /\bamount:\s*-(?!\s*\/)/;
    const offenders: string[] = [];

    for (const file of FILES) {
      for (const { n, text } of lines(file)) {
        if (pattern.test(text)) offenders.push(`${file}:${n}`);
      }
    }

    expect(
      offenders,
      'Negative ledger amount. Direction is carried by which of senderId/recipientId is null: ' +
        'a SINK is (senderId = user, recipientId = null) with a POSITIVE amount. ' +
        'The database CHECK constraint rejects negative amounts.'
    ).toEqual([]);
  });
});
