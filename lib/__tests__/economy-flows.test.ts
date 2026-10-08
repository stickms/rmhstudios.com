import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The coin-flow inventory (W7) is only worth having if it is complete, and the
 * way an inventory stops being complete is that somebody adds a faucet and does
 * not think of it as one.
 *
 * So this walks the tree for every ledger call and holds `COIN_FLOWS` to what
 * it finds. The check is by SOURCE FILE rather than by call: several flows are
 * several calls in one file (a wager settles three ways), and one flow can span
 * files (the casino tables). What must never happen is a file that moves coins
 * and appears in no flow at all.
 */

import { COIN_FLOWS, flowsOfKind, supplyShape } from '@/lib/economy/flows';

const ROOT = process.cwd();
const SCAN = ['lib', 'app', 'server'];

/** Files that call the ledger, by which verb they use. */
function ledgerCallSites(): { faucet: Set<string>; sink: Set<string>; transfer: Set<string> } {
  const faucet = new Set<string>();
  const sink = new Set<string>();
  const transfer = new Set<string>();

  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (entry === 'node_modules' || entry === '__tests__') continue;
        walk(p);
        continue;
      }
      if (!p.endsWith('.ts')) continue;
      const rel = p.slice(ROOT.length + 1).split(/[\\/]/).join('/');
      // The ledger's own modules define these; they are not call sites.
      if (rel === 'lib/economy/ledger-core.ts' || rel === 'lib/economy/ledger.server.ts') continue;

      const src = readFileSync(p, 'utf8');
      // Skip the definitions inside wager's escrow helper, which re-exports its
      // own same-named wrappers around the ledger.
      if (/\bcreditCoins(On)?\s*\(/.test(src.replace(/export (async )?function creditCoins[\s\S]*?\{/g, '')))
        faucet.add(rel);
      if (/\bdebitCoins(On)?\s*\(/.test(src.replace(/export (async )?function debitCoins[\s\S]*?\{/g, '')))
        sink.add(rel);
      if (/\btransferCoins(On)?\s*\(/.test(src)) transfer.add(rel);
    }
  };
  for (const d of SCAN) walk(join(ROOT, d));
  return { faucet, sink, transfer };
}

/** Every source path any flow names, with `*` globs expanded to a prefix. */
function registeredSources(): { path: string; prefix: boolean }[] {
  return COIN_FLOWS.flatMap((f) =>
    f.source.split(',').map((raw) => {
      const s = raw.trim();
      return s.endsWith('*.ts')
        ? { path: s.slice(0, -len('*.ts')), prefix: true }
        : { path: s, prefix: false };
    }),
  );
}
const len = (s: string) => s.length;

function isRegistered(rel: string): boolean {
  return registeredSources().some((r) => (r.prefix ? rel.startsWith(r.path) : r.path === rel));
}

describe('the coin-flow inventory covers the code', () => {
  const sites = ledgerCallSites();

  it('finds ledger call sites at all', () => {
    expect(sites.faucet.size + sites.sink.size + sites.transfer.size).toBeGreaterThan(10);
  });

  it('every file that creates coins is a registered faucet', () => {
    const unregistered = [...sites.faucet].filter((f) => !isRegistered(f)).sort();
    expect(unregistered).toEqual([]);
  });

  it('every file that destroys coins is a registered sink', () => {
    const unregistered = [...sites.sink].filter((f) => !isRegistered(f)).sort();
    expect(unregistered).toEqual([]);
  });

  it('every file that moves coins between members is a registered transfer', () => {
    const unregistered = [...sites.transfer].filter((f) => !isRegistered(f)).sort();
    expect(unregistered).toEqual([]);
  });

  it('names a file that exists for every flow', () => {
    const missing = registeredSources()
      .filter((r) => !r.prefix && !existsSync(join(ROOT, r.path)))
      .map((r) => r.path);
    expect(missing).toEqual([]);
  });
});

describe('the inventory is well formed', () => {
  it('has unique ids', () => {
    const ids = COIN_FLOWS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('says something about every flow', () => {
    for (const f of COIN_FLOWS) {
      expect({ id: f.id, described: f.note.length > 10 && f.surface.length > 3 }).toEqual({
        id: f.id,
        described: true,
      });
    }
  });

  it('has faucets, sinks and transfers', () => {
    const shape = supplyShape();
    expect(shape.faucets).toBeGreaterThan(0);
    expect(shape.sinks).toBeGreaterThan(0);
    expect(shape.transfers).toBeGreaterThan(0);
  });

  it('every unbounded faucet either names its sink or is a deliberate exception', () => {
    // The rule the file's header argues for: an unbounded faucet is fine when
    // the same activity takes coins on the way in, and worth a second look when
    // it does not. The four exceptions are named here rather than inferred, so
    // adding a fifth is a decision somebody makes on purpose.
    const PURE_SUPPLY = new Set([
      'staking-payout', // yield is genuinely new supply
      'prediction-bot-grant', // tops up synthetic accounts
      'admin-grant', // discretionary by definition
      'creator-earnings-payout', // pays out a balance accrued from transfers
    ]);
    const sinkIds = new Set(flowsOfKind('sink').map((s) => s.id));

    for (const f of flowsOfKind('faucet')) {
      if (f.bounded) continue;
      if (PURE_SUPPLY.has(f.id)) {
        expect({ id: f.id, pairsWith: f.pairsWith }).toEqual({ id: f.id, pairsWith: undefined });
        continue;
      }
      expect({ id: f.id, named: Boolean(f.pairsWith) }).toEqual({ id: f.id, named: true });
      expect({ id: f.id, sinkExists: sinkIds.has(f.pairsWith!) }).toEqual({
        id: f.id,
        sinkExists: true,
      });
    }
  });
});
