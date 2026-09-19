import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { GAME_CAPABILITIES, playabilityFor, type GameCapabilities } from '@/lib/game-capabilities';
import { SHARED_SAVE_GAMES } from '@/lib/game-saves/registry';
import { WAGER_ELIGIBLE_GAMES } from '@/lib/wager/eligible-games';

/**
 * Capability metadata is only worth having if a player can trust it, and the
 * way metadata stops being trustworthy is that a game changes and its entry
 * does not. Everything mechanically checkable is checked here against the code
 * rather than restated: touch support against real touch handling, multiplayer
 * against a realtime module, save scope against the save registry.
 */

const ROOT = process.cwd();

function readSources(dirs: string[]): string {
  let out = '';
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p) && !p.includes('__tests__')) out += readFileSync(p, 'utf8');
    }
  };
  for (const d of dirs) walk(join(ROOT, d));
  return out;
}

/**
 * Games whose code does not live at `lib/<id>` / `components/<id>`. Slice It! is
 * the whole of the shared `game/` module — `components/slice-it` holds only a
 * wrapper and a stylesheet — so the convention would check the wrong files and
 * report a game with a full multiplayer lobby as having none.
 */
const SOURCE_OVERRIDES: Record<string, string[]> = {
  'slice-it': ['lib/game', 'components/game', 'lib/slice-it', 'components/slice-it'],
  // Ships under its working title: the route lazy-loads `components/breakpoint`.
  'rochester-offensive': ['lib/breakpoint', 'components/breakpoint'],
};

/** Every source file that belongs to a game, by convention or override. */
function sourcesFor(gameId: string): string {
  return readSources(SOURCE_OVERRIDES[gameId] ?? [`lib/${gameId}`, `components/${gameId}`]);
}

describe('game capabilities', () => {
  it('covers exactly the game catalog — no missing, no stale entries', () => {
    const catalog = games.map((g) => g.id).sort();
    const declared = Object.keys(GAME_CAPABILITIES).sort();
    // Missing: a game shipped without capability data, so it can't be filtered,
    // can't get a device badge, and can't get a structured-data block.
    expect(catalog.filter((id) => !declared.includes(id))).toEqual([]);
    // Stale: an entry whose game is gone from the catalog.
    expect(declared.filter((id) => !catalog.includes(id))).toEqual([]);
  });

  it('declares a coherent input contract', () => {
    for (const [id, caps] of Object.entries(GAME_CAPABILITIES)) {
      // Anything required must also be listed as supported, or the device badge
      // computes a game as unplayable on hardware it actually runs on.
      const unsupported = caps.input.required.filter((m) => !caps.input.supported.includes(m));
      expect({ id, unsupported }).toEqual({ id, unsupported: [] });
      expect(caps.input.supported.length).toBeGreaterThan(0);
    }
  });

  it('declares a sane session range', () => {
    for (const [id, caps] of Object.entries(GAME_CAPABILITIES)) {
      const [min, max] = caps.sessionMinutes;
      expect({ id, ok: min > 0 && max >= min }).toEqual({ id, ok: true });
    }
  });

  it('declares a player count only where there is online play', () => {
    // Not the reverse: Slice It! and Velum 2099 run lobbies whose servers set no
    // cap, and inventing a number to satisfy a test would be exactly the kind of
    // decorative metadata this registry exists to avoid. Omission is the honest
    // answer, so the check is one-directional.
    for (const [id, caps] of Object.entries(GAME_CAPABILITIES)) {
      const online = caps.players.some((p) => p === 'online-versus' || p === 'online-coop');
      if (caps.maxPlayers !== undefined) {
        expect({ id, online }).toEqual({ id, online: true });
        expect(caps.maxPlayers).toBeGreaterThan(1);
      }
    }
  });

  // ── Claims checked against the code, not restated ────────────────────────

  it('save scope agrees with the shared-save registry', () => {
    const declaredShared = Object.entries(GAME_CAPABILITIES)
      .filter(([, c]) => c.save === 'shared-table')
      .map(([id]) => id)
      .sort();
    expect(declaredShared).toEqual([...SHARED_SAVE_GAMES].sort());
  });

  it('every game claiming touch support has touch handling in its source', () => {
    const TOUCH = /TouchControls|MobileControls|onTouchStart|touchstart|pointerdown|PointerEvent/;
    const missing: string[] = [];
    for (const [id, caps] of Object.entries(GAME_CAPABILITIES)) {
      if (!caps.input.supported.includes('touch')) continue;
      const src = sourcesFor(id);
      // A game with no directory of its own (its code lives in a shared shell or
      // a route file) can't be checked this way; skip rather than fail falsely.
      if (!src) continue;
      // `dom` games are React components — touch works through ordinary click
      // handling, so there is nothing specific to find.
      if (caps.engine === 'dom') continue;
      if (!TOUCH.test(src)) missing.push(id);
    }
    expect(missing).toEqual([]);
  });

  it('every game claiming online play has a realtime module', () => {
    const missing: string[] = [];
    for (const [id, caps] of Object.entries(GAME_CAPABILITIES)) {
      const online = caps.players.some((p) => p === 'online-versus' || p === 'online-coop');
      if (!online) continue;
      const src = sourcesFor(id);
      if (!src) continue;
      if (!/socket|multiplayer|realtime/i.test(src)) missing.push(id);
    }
    expect(missing).toEqual([]);
  });

  it('partyCapable matches the socket server\'s party registry exactly', () => {
    // The badge this drives says "you can bring your party straight into this".
    // A claim without a registry entry is a button that errors; a registry
    // entry without a claim is a feature nobody is told about. Both directions
    // are failures, so both are checked — this is the one field here that has a
    // definitive machine-readable source to be held against.
    // Resolve both spellings: a literal id, and the `GAME_ID` constant that
    // Bum's Rush registers with. A test that only saw literals would quietly
    // stop covering any game that tidied its id into a constant.
    const dir = join(ROOT, 'server/socket-server/handlers');
    const registered = new Set<string>();
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      const call = src.match(/registerPartyGame\(\s*(?:'([^']+)'|([A-Za-z_$][\w$]*))/);
      if (!call) continue;
      if (call[1]) {
        registered.add(call[1]);
        continue;
      }
      const constant = src.match(new RegExp(`const ${call[2]}\\s*=\\s*'([^']+)'`));
      expect({ file: f, resolved: Boolean(constant) }).toEqual({ file: f, resolved: true });
      if (constant) registered.add(constant[1]);
    }

    const claimed = Object.entries(GAME_CAPABILITIES)
      .filter(([, c]) => c.partyCapable)
      .map(([id]) => id)
      .sort();

    // Intersect with the catalog: the casino tables register too (hold'em is
    // party-capable and real), and they have no `GameInfo` entry to carry a
    // flag, so they are legitimately registered-but-unclaimed.
    const catalogIds = new Set(games.map((g) => g.id));
    const registeredInCatalog = [...registered].filter((id) => catalogIds.has(id)).sort();

    expect(claimed).toEqual(registeredInCatalog);
  });

  it('no game claims party support without also claiming online play', () => {
    // A party is several people in one room. A game that says it is
    // single-player only and also says it seats a party is describing two
    // different games.
    for (const [id, caps] of Object.entries(GAME_CAPABILITIES)) {
      if (!caps.partyCapable) continue;
      const online = caps.players.some((p) => p === 'online-versus' || p === 'online-coop');
      expect({ id, online }).toEqual({ id, online: true });
    }
  });

  it('every party-capable game can reclaim a room the party never joined', () => {
    // A party room is created with nobody in it. A game that only deletes rooms
    // when the last PLAYER leaves therefore has no path to deleting one that
    // never had a player, and each abandoned queue leaks a room forever in the
    // busiest process on the system.
    //
    // Two ways to be safe, and both count: a `reapIfEmpty` (the party system
    // calls it once after PARTY_ROOM_GRACE_MS), or the game's own periodic
    // sweep. The sweepers must respect PARTY_ROOM_GRACE_MS — without it they
    // delete the party's room before it can arrive, which is the opposite bug
    // and just as fatal, so a sweeping game must name the constant.
    const dir = join(ROOT, 'server/socket-server/handlers');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    const registered: { id: string; file: string; src: string }[] = [];
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      const m = src.match(/registerPartyGame\(\s*(?:'([^']+)'|([A-Z_]+))/);
      if (m) registered.push({ id: m[1] ?? m[2], file: f, src });
    }
    expect(registered.length).toBeGreaterThan(0);

    for (const { id, src } of registered) {
      const reaps = /reapIfEmpty\s*\(/.test(src);
      const sweeps = /setInterval\(/.test(src) && src.includes('PARTY_ROOM_GRACE_MS');
      expect({ id, reclaimable: reaps || sweeps }).toEqual({ id, reclaimable: true });
    }
  });

  it('every webgl game actually reaches for webgl', () => {
    const missing: string[] = [];
    for (const [id, caps] of Object.entries(GAME_CAPABILITIES)) {
      if (caps.engine !== 'webgl') continue;
      const src = sourcesFor(id);
      if (!src) continue;
      if (!/from ['"]three|getContext\(['"]webgl|WebGLRenderer/.test(src)) missing.push(id);
    }
    expect(missing).toEqual([]);
  });

  it('never marks a dom game as demanding', () => {
    // The inverse ("every webgl game is demanding") looks tempting and is wrong:
    // Temple of Joy is an idle clicker with one 3D bowl and Daily Puzzles is a
    // 2D game with a 3D shell, and `engine` records the heaviest renderer a game
    // reaches for, not how hard it works. A DOM game has no GPU scene at all,
    // which is the half of the rule that actually holds.
    const wrong = Object.entries(GAME_CAPABILITIES)
      .filter(([, c]) => c.engine === 'dom' && c.demanding)
      .map(([id]) => id);
    expect(wrong).toEqual([]);
  });

  // ── Cross-registry consistency ───────────────────────────────────────────

  it('every wager-eligible id resolves to a real game or app', () => {
    const known = new Set([...games.map((g) => g.id), ...apps.map((a) => a.id)]);
    const dangling = WAGER_ELIGIBLE_GAMES.filter((g) => !known.has(g.id)).map((g) => g.id);
    expect(dangling).toEqual([]);
  });

  it('every wager-eligible game in the games catalog supports head-to-head play', () => {
    // A wager needs two players and a winner. An id in the wager registry that
    // the capability data calls single-player-only is one of the two lying.
    const inCatalog = new Set(games.map((g) => g.id));
    const bad = WAGER_ELIGIBLE_GAMES.filter((w) => inCatalog.has(w.id)).filter((w) => {
      const caps = GAME_CAPABILITIES[w.id];
      return !caps?.players.some((p) => p === 'online-versus' || p === 'async-leaderboard');
    });
    expect(bad.map((w) => w.id)).toEqual([]);
  });
});

describe('playabilityFor', () => {
  const base: GameCapabilities = {
    genre: ['puzzle'],
    players: ['single'],
    input: { supported: ['mouse', 'touch'], required: [] },
    sessionMinutes: [5, 10],
    engine: 'dom',
    demanding: false,
    save: 'none',
    accessibility: [],
  };
  const desktop = { coarsePointer: false, perfLite: false };
  const phone = { coarsePointer: true, perfLite: false };

  it('passes a touch-friendly game on a phone', () => {
    expect(playabilityFor(base, phone)).toEqual({ playable: true });
  });

  it('blocks a keyboard-required game on a phone with a reason', () => {
    const caps = { ...base, input: { supported: ['keyboard'], required: ['keyboard'] } } as const;
    expect(playabilityFor(caps as GameCapabilities, phone)).toEqual({
      playable: false,
      reason: 'needs-keyboard',
    });
  });

  it('blocks a mouse-only game on a phone', () => {
    const caps = { ...base, input: { supported: ['mouse'], required: [] } } as const;
    expect(playabilityFor(caps as GameCapabilities, phone)).toEqual({
      playable: false,
      reason: 'needs-pointer',
    });
  });

  it('blocks a demanding game on a low-end device', () => {
    expect(playabilityFor({ ...base, demanding: true }, { ...desktop, perfLite: true })).toEqual({
      playable: false,
      reason: 'too-demanding',
    });
  });

  it('lets a demanding game through on a capable device', () => {
    expect(playabilityFor({ ...base, demanding: true }, desktop)).toEqual({ playable: true });
  });

  it('accepts a gyro game on a phone even without touch', () => {
    const caps = { ...base, input: { supported: ['gyro'], required: [] } } as const;
    expect(playabilityFor(caps as GameCapabilities, phone)).toEqual({ playable: true });
  });

  it('holds for every real game in the catalog on a desktop', () => {
    for (const [id, caps] of Object.entries(GAME_CAPABILITIES)) {
      expect({ id, ...playabilityFor(caps, desktop) }).toEqual({ id, playable: true });
    }
  });
});
