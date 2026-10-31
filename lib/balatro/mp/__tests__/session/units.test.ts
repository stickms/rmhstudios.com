/**
 * Unit tests for the session runtime's pure pieces: glyph table + sanitising,
 * token buckets, chat limits, local history, the lobby reducer, routing from
 * outcomes, the referee driver (hs, coalesced checkpoints, ticks, serialised
 * steps), takeover checkpoints, the snapshot store and the WireLink's
 * receive-side defences.
 */

import { describe, expect, it } from 'vitest';
import { FakeNet, fakeConnection } from '../../../../shared/p2p/fake-channel.test-support';
import { encodeControl } from '../../../../shared/p2p';
import { encodeGlyphs, glyphsFor, guessLang, parseGlyphs, sanitizeName, sanitizeText } from '../../identity';
import { KeyedBuckets, PeerLimiter, TokenBucket } from '../../ratelimit';
import { Chat } from '../../chat';
import { memoryKv, readHistory, recordResult } from '../../history';
import {
  addPlayer,
  buildMatch,
  createLobby,
  kick,
  removePlayer,
  returnToLobby,
  setDeck,
  setOption,
  setReady,
  setTeam,
  startBlock,
  startLobby,
  successorOf,
  type PlayerSeed,
} from '../../lobby/lobby-reducer';
import { MP_DECKS, VANILLA_DECKS } from '../../setup/draft';
import { Routing } from '../../match/routing';
import { RefereeDriver } from '../../match/match-host';
import { HS_MIGRATION_GAP, successorHs, takeoverCheckpoint } from '../../migration';
import { memorySnapshotStore } from '../../rejoin/rejoin-store';
import { WireLink } from '../../transport/wire-link';
import { fakeScheduler, T0 } from './world.test-support';
import { makeMatch } from '../../referee/__tests__/helpers';
import { zLobbyState, zStartedMatch, type RefCheckpoint, type RefMsg } from '../../types';
import type { Envelope } from '../../wire';

const seed = (id: string, joinedAt: number, role: 'player' | 'spectator' = 'player'): PlayerSeed => ({
  id,
  name: id,
  avatarUrl: null,
  avatarJoker: 'j_joker',
  blindCol: 1,
  role,
  joinedAt,
});

describe('identity: glyph bitmap and sanitising', () => {
  const bin = encodeGlyphs(
    [
      { name: 'resources/fonts/m6x11plus.ttf', codepoints: [...'abcdefghijklmnopqrstuvwxyz ABC?'].map((c) => c.codePointAt(0) as number) },
      { name: 'resources/fonts/NotoSansJP.ttf', codepoints: [0x3042, 0x61] },
    ],
    { 'en-us': 0, ja: 1 },
  );

  it('parses the RMHG v1 layout and picks the font by language', () => {
    const t = parseGlyphs(bin);
    expect(t?.fonts.map((f) => f.name)).toEqual(['resources/fonts/m6x11plus.ttf', 'resources/fonts/NotoSansJP.ttf']);
    expect(glyphsFor(t, 'ja')).toBe(t?.fonts[1]?.bits);
    expect(glyphsFor(t, 'fr')).toBe(t?.fonts[0]?.bits); // unknown → en-us
    expect(sanitizeText('abc あ', glyphsFor(t, 'en-us'))).toBe('abc ?');
    expect(sanitizeText('aあ', glyphsFor(t, 'ja'))).toBe('aあ');
  });

  it('rejects corrupt tables', () => {
    expect(parseGlyphs(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(parseGlyphs(bin.slice(0, 20))).toBeNull();
    const bad = bin.slice();
    bad[4] = 2;
    expect(parseGlyphs(bad)).toBeNull();
  });

  it('collapses controls and whitespace, caps length, never returns an empty name', () => {
    expect(sanitizeText('\u0000a\t\n b‏', null)).toBe('a b');
    expect(sanitizeText('x'.repeat(600), null).length).toBe(500);
    expect(sanitizeText('ab cd ef', null, 4)).toBe('ab c');
    expect(sanitizeName('\u0007\u0007', null)).toBe('Player');
    expect(sanitizeName('A'.repeat(50), null)).toHaveLength(32);
    expect(sanitizeText('😀 ok', 'all')).toBe('😀 ok');
  });

  it('guesses a G.LANGUAGES key', () => {
    expect(guessLang({ language: 'en-GB' })).toBe('en-us');
    expect(guessLang({ language: 'pt-PT' })).toBe('pt_BR');
    expect(guessLang({ language: 'zh-TW' })).toBe('zh_TW');
    expect(guessLang({ language: 'ja-JP' })).toBe('ja');
  });
});

describe('rate limits', () => {
  it('token buckets refill at their rate up to the burst', () => {
    let t = 0;
    const b = new TokenBucket({ rate: 1, burst: 5 }, () => t);
    for (let i = 0; i < 5; i++) expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
    t = 999;
    expect(b.take()).toBe(false);
    t = 1001;
    expect(b.take()).toBe(true);
    t = 1_000_000;
    expect(b.available()).toBe(5);
  });

  it('keys get their own buckets; the peer limiter separates replay logs', () => {
    let t = 0;
    const k = new KeyedBuckets({ rate: 1, burst: 1 }, () => t, 2);
    expect(k.take('a')).toBe(true);
    expect(k.take('a')).toBe(false);
    expect(k.take('b')).toBe(true);
    const p = new PeerLimiter(() => t);
    let ok = 0;
    for (let i = 0; i < 200; i++) if (p.allow('location')) ok++;
    expect(ok).toBe(100);
    let logs = 0;
    for (let i = 0; i < 2000; i++) if (p.allow('log')) logs++;
    expect(logs).toBe(1024);
    t = 1000;
    expect(p.allow('location')).toBe(true);
    expect(p.dropped).toBe(100 + 976);
  });
});

describe('chat', () => {
  it('limits own lines, per-sender relays and receivers; mutes; system lines bypass limits', () => {
    let t = 0;
    const c = new Chat({ now: () => t, glyphs: () => null });
    const sent = Array.from({ length: 8 }, (_, i) => c.prepareOwn(`m${i}`)).filter(Boolean);
    expect(sent).toHaveLength(5);
    expect(c.prepareOwn('   ')).toBeNull();
    for (let i = 0; i < 5; i++) expect(c.allowRelay('x')).toBe(true);
    expect(c.allowRelay('x')).toBe(false);
    expect(c.allowRelay('y')).toBe(true);
    c.mute('y', true);
    expect(c.receive('y', 'Y', 'hi', false, 'me')).toBeNull();
    expect(c.receive('me', 'Me', 'echo', false, 'me')).toBeNull();
    expect(c.receive('z', 'Z', 'sys', true, 'me')?.kind).toBe('system');
    c.enabled = false;
    expect(c.receive('z', 'Z', 'off', false, 'me')).toBeNull();
    t = 10_000;
    expect(c.prepareOwn('later')).toBe('later');
  });
});

describe('history (HUD-15)', () => {
  it('counts wins, losses, streaks, PvP games and days; draws count as games only', () => {
    const kv = memoryKv();
    recordResult(kv, 'win', new Date('2026-10-01T10:00:00Z'));
    recordResult(kv, 'win', new Date('2026-10-01T12:00:00Z'));
    recordResult(kv, 'draw', new Date('2026-10-02T12:00:00Z'));
    recordResult(kv, 'practice', new Date('2026-10-03T12:00:00Z'));
    expect(readHistory(kv)).toEqual({ wins: 2, losses: 0, games: 4, pvpGames: 3, streak: 2, days: 3 });
    recordResult(kv, 'lose', new Date('2026-10-03T13:00:00Z'));
    expect(readHistory(kv)).toMatchObject({ losses: 1, streak: 0, days: 3 });
    kv.setItem('rmh-balatro-mp-history', '{not json');
    expect(readHistory(kv).games).toBe(0);
    expect(readHistory(null).games).toBe(0);
  });
});

describe('lobby reducer', () => {
  const base = () =>
    addPlayer(addPlayer(createLobby({ code: 'ABCDEF', kind: 'private', queueMode: 'pvp_nemesis', host: seed('h', 1) }), seed('m', 2)), seed('s', 3, 'spectator'));

  it('bumps the version only on a real change; validates with the frozen schema', () => {
    const s = base();
    expect(zLobbyState.safeParse(s).success).toBe(true);
    expect(setReady(s, 'h', true)).toBe(s); // the host is always ready
    expect(setReady(s, 's', true)).toBe(s); // spectators are not seated
    const r = setReady(s, 'm', true);
    expect(r.version).toBe(s.version + 1);
    expect(setReady(r, 'm', true)).toBe(r);
    expect(removePlayer(s, 'h')).toBe(s);
  });

  it('LOB-05: START needs two seated, connected players with every guest ready', () => {
    let s = createLobby({ code: 'ABCDEF', kind: 'private', queueMode: 'pvp_nemesis', host: seed('h', 1) });
    expect(startBlock(s)).toBe('players');
    s = addPlayer(s, seed('m', 2));
    expect(startBlock(s)).toBe('ready');
    s = setReady(s, 'm', true);
    expect(startBlock(s)).toBeNull();
    expect(successorOf(s)).toBe('m');
  });

  it('options: field-wise sanitising, test-only seat grace, no edits once started', () => {
    const s = base();
    expect(setOption(s, 'startingLives', 999, { testBuild: false })).toBe(s);
    expect(setOption(s, 'ruleset', 'ruleset_mp_nope', { testBuild: false })).toBe(s);
    expect(setOption(s, 'seatGraceMs', 10_000, { testBuild: false })).toBe(s);
    expect(setOption(s, 'seatGraceMs', 10_000, { testBuild: true }).options.seatGraceMs).toBe(10_000);
    expect(setOption(s, 'modifierLayers', ['eeeee', 'bogus'], { testBuild: false }).options.modifierLayers).toEqual(['eeeee']);
    expect(setDeck(s, { deck: 'b_blue', stake: 3, mpStake: null, challenge: null }).deck).toBe('b_blue');
  });

  it('teams and roles: only the queue mode\'s values, the Runner is exclusive', () => {
    let s = createLobby({ code: 'ABCDEF', kind: 'private', queueMode: 'pvp_manhunt', host: seed('h', 1) });
    s = addPlayer(s, seed('m', 2));
    expect(setTeam(s, 'h', 'A')).toBe(s);
    s = setTeam(s, 'h', 'RUNNER');
    s = setTeam(s, 'm', 'RUNNER');
    expect(s.players.map((p) => p.team)).toEqual(['HUNTER', 'RUNNER']);
  });

  it('builds a valid StartedMatch with the forced options and per-player loadouts', () => {
    let s = setReady(base(), 'm', true);
    s = setOption(s, 'ruleset', 'ruleset_mp_majorleague', { testBuild: false });
    s = setOption(s, 'differentDecks', true, { testBuild: false });
    s = setOption(s, 'randomLoadout', true, { testBuild: false });
    const m = buildMatch(s, { runId: 'r1', seed: 'ZZZZ1234', rngSeed: 7, now: T0, contentHash: `${'a'.repeat(24)}-v1` });
    expect(zStartedMatch.safeParse(m).success).toBe(true);
    expect(m.roster.map((r) => r.id)).toEqual(['h', 'm']);
    expect(m.ruleset).toBe('ruleset_mp_majorleague');
    expect(Object.keys(m.perPlayer ?? {})).toEqual(['h', 'm']);
    expect(m.perPlayer?.h?.stake).toBeGreaterThanOrEqual(1);
    const custom = buildMatch(setOption(s, 'customSeed', 'ABC', { testBuild: false }), {
      runId: 'r2', seed: 'ZZZZ1234', rngSeed: 7, now: T0, contentHash: `${'a'.repeat(24)}-v1`,
    });
    expect(custom.seed).toBe('ABC');
    const started = startLobby(s, m);
    expect(started.open).toBe(false);
    expect(startBlock(started)).toBe('started');
    expect(setOption(started, 'startingLives', 2, { testBuild: false })).toBe(started);
    const back = returnToLobby(started);
    expect(back.started).toBeNull();
    expect(back.open).toBe(true);
    expect(kick(back, 'm').kicked).toEqual(['m']);
  });
});

describe('different_decks / random_loadout (C15, LOB-07)', () => {
  const inp = { runId: 'r1', seed: 'ZZZZ1234', rngSeed: 7, now: T0, contentHash: `${'a'.repeat(24)}-v1` };
  const COCKTAIL: readonly string[] = [...VANILLA_DECKS, ...MP_DECKS];
  type Flag = 'differentDecks' | 'randomLoadout' | 'differentSeeds';
  const lobby = (opts: Partial<Record<Flag, boolean>>, ruleset = 'ruleset_mp_expanded') => {
    let s = createLobby({ code: 'ABCDEF', kind: 'private', queueMode: 'pvp_royale', host: seed('h', 1) });
    for (let i = 0; i < 6; i++) s = addPlayer(s, seed(`m${i}`, 2 + i));
    s = setOption(s, 'ruleset', ruleset, { testBuild: false });
    for (const [k, v] of Object.entries(opts)) s = setOption(s, k as Flag, v, { testBuild: false });
    return setDeck(s, { deck: 'b_plasma', stake: 3, mpStake: null, challenge: null });
  };

  it('different_decks off: everyone plays the host deck, random_loadout alone does nothing', () => {
    for (const o of [{}, { randomLoadout: true }]) {
      const m = buildMatch(lobby(o), inp);
      expect(m.perPlayer).toBeUndefined();
      expect([m.deck, m.stake]).toEqual(['b_plasma', 3]);
    }
  });

  it('different_decks without random_loadout: no host-chosen decks (each player applies its own pick)', () => {
    const m = buildMatch(lobby({ differentDecks: true }), inp);
    expect(m.perPlayer).toBeUndefined();
    expect(m.options.differentDecks).toBe(true);
    const seeds = buildMatch(lobby({ differentDecks: true, differentSeeds: true }), inp);
    for (const e of Object.values(seeds.perPlayer ?? {})) expect(e.deck).toBeUndefined();
  });

  it('random_loadout rolls each player a Cocktail-pool deck and a stake, fixed by seed and player', () => {
    const s = lobby({ differentDecks: true, randomLoadout: true });
    const a = buildMatch(s, inp);
    expect(zStartedMatch.safeParse(a).success).toBe(true);
    const per = a.perPlayer ?? {};
    expect(Object.keys(per)).toHaveLength(7);
    for (const e of Object.values(per)) {
      expect(COCKTAIL).toContain(e.deck);
      expect(e.stake).toBeGreaterThanOrEqual(1);
      expect(e.stake).toBeLessThanOrEqual(8);
      expect(e.seed).toBeUndefined();
    }
    // Same seed: same loadouts, whatever the host's CSPRNG state; another seed: others.
    expect(buildMatch(s, { ...inp, rngSeed: 99 }).perPlayer).toEqual(per);
    expect(buildMatch(s, { ...inp, seed: 'QQQQ0000' }).perPlayer).not.toEqual(per);
    // The roll is per player: not everyone gets the same loadout.
    expect(new Set(Object.values(per).map((e) => `${e.deck}/${e.stake}`)).size).toBeGreaterThan(1);
  });

  it('the pool holds the MP decks with MP content and only vanilla decks without', () => {
    const decks = (ruleset: string) => {
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const m = buildMatch(lobby({ differentDecks: true, randomLoadout: true }, ruleset), { ...inp, seed: `S${i}` });
        for (const e of Object.values(m.perPlayer ?? {})) seen.add(e.deck ?? '');
      }
      return seen;
    };
    const mp = decks('ruleset_mp_expanded');
    expect([...mp].some((k) => k.startsWith('b_mp_'))).toBe(true);
    for (const k of mp) expect(COCKTAIL).toContain(k);
    const vanilla: readonly string[] = VANILLA_DECKS;
    for (const k of decks('ruleset_mp_vanilla')) expect(vanilla).toContain(k);
  });

  it("with different seeds each player's roll follows its own seed", () => {
    const m = buildMatch(lobby({ differentDecks: true, randomLoadout: true, differentSeeds: true }), inp);
    for (const e of Object.values(m.perPlayer ?? {})) {
      expect(e.seed).toMatch(/^[A-Z0-9]{8}$/);
      expect(e.deck).toBeDefined();
    }
  });
});

describe('routing (§3.b)', () => {
  it('derives targets from outcomes and routes each peer kind', () => {
    const r = new Routing('a', ['a', 'b', 'c']);
    r.apply({ t: 'nemesis_pairing', ante: 1, pairing: { a: 'b', b: 'a', c: '' } });
    expect(r.target).toBe('b');
    expect(r.route('timer', {})).toEqual(['b']);
    expect(r.route('nemesis_info', {})).toBe('*');
    expect(r.route('trap_fired', { owner: 'c' })).toEqual(['c']);
    expect(r.route('trap_fired', { owner: 'a' })).toEqual([]);
    expect(r.route('sync', { to: 'c' })).toEqual(['c']);
    expect(r.route('sync', { kind: 'phantom' })).toBe('*');
    r.noteRequest('deck_req', 'c');
    expect(r.route('deck_res', {})).toEqual(['c']);
    expect(r.route('deck_res', {})).toEqual(['b']);
    r.apply({ t: 'team_card_target', pairing: { a: 'c' } });
    expect(r.route('trap_plant', {})).toEqual(['c']);
    r.apply({ t: 'royale_target', targets: { a: '' } });
    expect(r.target).toBeNull();
    r.apply({ t: 'player_lives', player_id: '*all*', lives: 3 });
    r.apply({ t: 'player_lives', player_id: 'b', lives: 2, lost: 1 });
    expect(r.lives).toEqual({ a: 3, b: 2, c: 3 });
  });
});

describe('routing: Manhunt traps (A1 §5.3)', () => {
  it('sends a Runner trap to every live Hunter, a Hunter trap to its target', () => {
    const runner = new Routing('r', ['h1', 'r', 'h2', 'h3']);
    runner.apply({ t: 'team_roster', roster: { h1: 'HUNTER', r: 'RUNNER', h2: 'HUNTER', h3: 'HUNTER' } });
    runner.apply({ t: 'manhunt_target', target_id: 'h2' });
    expect(runner.route('trap_plant', {})).toEqual(['h1', 'h2', 'h3']);
    expect(runner.route('timer', {})).toEqual(['h2']);
    runner.apply({ t: 'player_lives', player_id: 'h3', lives: 0, lost: 1 });
    expect(runner.route('trap_plant', {})).toEqual(['h1', 'h2']);
    const hunter = new Routing('h1', ['h1', 'r', 'h2']);
    hunter.apply({ t: 'team_roster', roster: { h1: 'HUNTER', r: 'RUNNER', h2: 'HUNTER' } });
    hunter.apply({ t: 'manhunt_target', target_id: 'r' });
    expect(hunter.route('trap_plant', {})).toEqual(['r']);
  });
});

describe('referee driver', () => {
  function driver(match = makeMatch({ n: 2 }), firstHs = 0) {
    const net = new FakeNet();
    const sched = fakeScheduler(net);
    const out: { to: string; msg: RefMsg; hs: number }[] = [];
    const cps: RefCheckpoint[] = [];
    let d: RefereeDriver;
    // eslint-disable-next-line prefer-const
    d = new RefereeDriver({
      sched,
      match: { ...match, startedAt: T0 },
      firstHs,
      emit: (to, msg, hs) => {
        out.push({ to, msg, hs });
        // A loopback input while the step's outputs are still delivered (the host's own client).
        if (msg.t === 'start_blind') d.event('p1', { t: 'play_hand', score: '10', hands_left: 0, skips: 0 });
      },
      checkpoint: (cp) => cps.push(cp),
    });
    return { d, net, out, cps };
  }

  it('numbers outcomes, serialises re-entrant inputs, coalesces checkpoints to 250 ms and re-sends the win', () => {
    const { d, net, out, cps } = driver();
    d.reset(42);
    expect(out.map((o) => o.hs)).toEqual(out.map((_, i) => i + 1));
    expect(cps).toHaveLength(1); // the first goes out at once
    d.event('p1', { t: 'ready_blind', starting_hands: 1 });
    d.event('p2', { t: 'ready_blind', starting_hands: 1 });
    expect(out.some((o) => o.msg.t === 'start_blind')).toBe(true);
    expect(cps).toHaveLength(1); // coalesced …
    net.advance(260);
    expect(cps).toHaveLength(2); // … into one
    expect(cps[1]?.players.p1?.hands).toBe(0); // the re-entrant play_hand landed after start_blind
    d.event('p2', { t: 'play_hand', score: '5', hands_left: 0, skips: 0 });
    expect(d.over?.t === 'win' || d.over?.t === 'end_pvp' || d.over === null).toBe(true);
    // Lose every life to finish: starting lives are 4.
    for (let round = 0; round < 6 && !d.over; round++) {
      d.event('p1', { t: 'new_round' });
      d.event('p2', { t: 'new_round' });
      d.event('p1', { t: 'ready_blind', starting_hands: 1 });
      d.event('p2', { t: 'ready_blind', starting_hands: 1 });
      d.event('p2', { t: 'play_hand', score: '5', hands_left: 0, skips: 0 });
    }
    expect(d.over?.t).toBe('win');
    const wins = () => out.filter((o) => o.msg.t === 'win').length;
    expect(wins()).toBe(1);
    net.advance(net.now + 3_100);
    expect(wins()).toBe(2);
    net.advance(net.now + 5_100);
    expect(wins()).toBe(3);
    const hs = out.map((o) => o.hs);
    expect(new Set(hs).size).toBe(hs.length);
  });

  it('takeover: successor hs above everything seen; rebuilt checkpoint without one', () => {
    expect(successorHs(41)).toBe(41 + HS_MIGRATION_GAP);
    const match = makeMatch({ n: 3, queueMode: 'pvp_royale' });
    const rebuilt = takeoverCheckpoint(match, null, { lives: { p1: 2, p2: 1, p3: 4 } }, T0, 9);
    expect(rebuilt.rebuilt).toBe(true);
    expect(rebuilt.checkpoint.players.p2?.lives).toBe(1);
    const other = { ...rebuilt.checkpoint, runId: 'elsewhere' };
    expect(takeoverCheckpoint(match, other, { lives: {} }, T0, 9).rebuilt).toBe(true);
    expect(takeoverCheckpoint(match, rebuilt.checkpoint, { lives: {} }, T0, 9)).toEqual({ checkpoint: rebuilt.checkpoint, rebuilt: false });
  });

  it('migration equivalence: a restored driver produces the same outcomes as the original (200 seeded matches)', () => {
    for (let k = 0; k < 200; k++) {
      const n = 2 + (k % 5);
      const queueMode = (['pvp_nemesis', 'pvp_royale', 'pvp_teams', 'pvp_manhunt'] as const)[k % 4];
      const match = makeMatch({ n, queueMode, runId: `fz${k}`, options: { startingLives: 2 } });
      const a = driver(match);
      a.d.reset(1000 + k);
      const ids = match.roster.map((r) => r.id);
      let x = k * 7919 + 1;
      const rnd = (m: number) => {
        x = (x * 48271) % 2147483647;
        return x % m;
      };
      const script: [string, Parameters<RefereeDriver['event']>[1]][] = [];
      for (let i = 0; i < 40; i++) {
        const id = ids[rnd(ids.length)] as string;
        const pick = rnd(4);
        script.push([
          id,
          pick === 0
            ? { t: 'ready_blind', starting_hands: 1 + rnd(3) }
            : pick === 1
              ? { t: 'play_hand', score: String(rnd(1000)), hands_left: rnd(3), skips: 0 }
              : pick === 2
                ? { t: 'set_ante', ante: 1 + rnd(4) }
                : { t: 'fail_round' },
        ]);
      }
      const cut = 10 + rnd(20);
      for (const [id, e] of script.slice(0, cut)) a.d.event(id, e);
      a.d.flush();
      const cp = a.d.latest as RefCheckpoint;
      const b = driver(match, successorHs(a.d.hs));
      b.d.restore(structuredClone(cp), ids);
      const beforeA = a.out.length;
      const beforeB = b.out.length;
      for (const [id, e] of script.slice(cut)) {
        a.d.event(id, e);
        b.d.event(id, e);
      }
      expect(b.out.slice(beforeB).map((o) => o.msg), `match ${k}`).toEqual(a.out.slice(beforeA).map((o) => o.msg));
      expect(b.d.over).toEqual(a.d.over);
    }
  });
});

describe('snapshot store', () => {
  it('keeps the newest three runs', async () => {
    const s = memorySnapshotStore();
    for (let i = 0; i < 5; i++) await s.put({ runId: `r${i}`, code: 'ABCDEF', savedAt: i, run: new Uint8Array([i]), state: '{}' });
    expect(s.all().map((x) => x.runId).sort()).toEqual(['r2', 'r3', 'r4']);
    expect((await s.get('r4'))?.run).toEqual(new Uint8Array([4]));
    await s.delete('r4');
    expect(await s.get('r4')).toBeNull();
  });
});

describe('WireLink receive defences', () => {
  it('drops non-JSON, invalid envelopes and local-only kinds; delivers valid ones', async () => {
    const net = new FakeNet();
    const sched = fakeScheduler(net);
    const conn = fakeConnection(net, { latencyMs: 1 }, 5);
    const got: Envelope[] = [];
    const rx = new WireLink({ sched, onEnvelope: (e) => got.push(e) });
    rx.attach(conn.host, 'direct');
    const tx = new WireLink({ sched, onEnvelope: () => undefined });
    tx.attach(conn.member, 'direct');
    net.advance(10);
    await Promise.resolve();
    net.advance(20);
    tx.send('ready', { ready: true });
    tx.send('kick', {});
    tx.send('ready', { ready: 'x' } as never);
    (tx as unknown as { link: { send(b: Uint8Array): boolean } }).link.send(new Uint8Array([0x21, 0x7b]));
    (tx as unknown as { link: { send(b: Uint8Array): boolean } }).link.send(encodeControl({ v: 2, k: 'ready', s: 1, d: {} }));
    net.advance(100);
    expect(got.map((e) => e.k)).toEqual(['ready']);
    expect(rx.stats.dropped).toEqual({ decode: 3, rate: 0, local: 1 });
    rx.close();
    tx.close();
  });
});
