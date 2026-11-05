/**
 * Hearthworks multiplayer on REAL WebRTC (docs/hearthworks-multiplayer.md §Real-browser e2e). Opt-in; not part
 * of `pnpm test`:
 *
 *   pnpm exec tsx testing/hearthworks-e2e/run.ts                 # the default scenarios
 *   pnpm exec tsx testing/hearthworks-e2e/run.ts core freeze     # named scenarios
 *   pnpm exec tsx testing/hearthworks-e2e/run.ts --list
 *
 * Every scenario boots its own hub (the REAL hearthworks-p2p handler + SignalHub, a fake session lookup),
 * serves the bundled player page, and drives real Chromium pages through `window.hw`.
 */

import { Harness, Player, sleep, startHarness } from './harness';

const ACCOUNTS = {
  'tok-host': { id: 'acct-host', name: 'Hosty' },
  'tok-ann': { id: 'acct-ann', name: 'Ann' },
  'tok-bob': { id: 'acct-bob', name: 'Bob' },
  'tok-cat': { id: 'acct-cat', name: 'Cat' },
  'tok-dan': { id: 'acct-dan', name: 'Dan' },
};
const A = {
  host: ACCOUNTS['tok-host'],
  ann: ACCOUNTS['tok-ann'],
  bob: ACCOUNTS['tok-bob'],
  cat: ACCOUNTS['tok-cat'],
  dan: ACCOUNTS['tok-dan'],
};

let stepCount = 0;

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  process.stdout.write(`    ... ${name}`);
  try {
    const r = await fn();
    process.stdout.write(`\r    ok   ${name} (${Date.now() - t} ms)\n`);
    stepCount++;
    return r;
  } catch (err) {
    process.stdout.write(`\r    FAIL ${name}\n`);
    throw err;
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const note = (msg: string) => console.log(`         ${msg}`);

/** Every tick two players both recorded at rest must hold the same world hash; there must be enough of them. */
async function agree(a: Player, b: Player, minCommon = 8, timeoutMs = 20_000): Promise<number> {
  const started = Date.now();
  let lastDiff = '';
  while (Date.now() - started < timeoutMs) {
    const [ha, hb] = await Promise.all([a.ev((hw) => hw.hashes() as [number, string][]), b.ev((hw) => hw.hashes() as [number, string][])]);
    const mb = new Map(hb);
    const common = ha.filter(([t]) => mb.has(t));
    const newest = common.slice(-minCommon);
    if (newest.length >= minCommon && newest.every(([t, h]) => mb.get(t) === h)) return newest.length;
    lastDiff = `${common.length} common ticks, newest ${newest.map(([t, h]) => `${t}:${h}/${mb.get(t)}`).slice(-3).join(' ')}`;
    await sleep(150);
  }
  throw new Error(`worlds of ${a.label} and ${b.label} did not converge (${lastDiff})`);
}

const spot = (size: number, dx: number, dz = 0) => ({ x: Math.floor(size / 2) + dx, z: Math.floor(size / 2) + dz });
const place = (kind: 'road' | 'cottage', p: { x: number; z: number }) => ({ type: 'place' as const, kind, ...p });
const moneys = (s: { players: Record<string, { money: number }> }) => Object.fromEntries(Object.entries(s.players).map(([k, v]) => [k, v.money]));

async function startRoom(host: Player, opts: Record<string, unknown> = {}): Promise<string> {
  await host.ev((hw, o) => hw.host({ name: 'E2E world', maxPlayers: 4, ...o }), opts);
  await host.until('hosting', (hw) => hw.lobby().phase === 'hosting');
  return host.ev((hw) => hw.lobby().code as string);
}

async function joinRoom(p: Player, code: string, password?: string): Promise<void> {
  await p.ev((hw, a) => hw.join(a.code, a.password), { code, password });
  await p.until('member with the world', (hw) => hw.lobby().phase === 'member' && hw.peerReady(), 40_000);
}

/* ─── Scenarios ──────────────────────────────────────────────────────────── */

type Scenario = {
  about: string;
  slow?: boolean;
  hub?: { pingIntervalMs?: number; pingTimeoutMs?: number };
  run(h: Harness): Promise<void>;
};

const SCENARIOS: Record<string, Scenario> = {
  core: {
    about: 'join, commands, convergence, host SIGKILL → migration, late joiner, graceful handover',
    async run(h) {
      const SIZE = 64; // a snapshot of this world is several 16 KB DataChannel fragments
      const host = await h.newPlayer('host', A.host, { proc: 'host', size: SIZE });
      const ann = await h.newPlayer('ann', A.ann, { size: SIZE });
      const bob = await h.newPlayer('bob', A.bob, { size: SIZE });
      const code = await step('host creates a room', () => startRoom(host));
      await step('ann joins: real ICE + DataChannels, snapshot received', () => joinRoom(ann, code));
      await step('bob joins', () => joinRoom(bob, code));
      await step('roster: 3 players, direct connections, successor named', async () => {
        await host.until('3 players with direct links', (hw) => {
          const l = hw.lobby();
          return l.players.length === 3 && l.players.every((p) => p.host || p.conn === 'direct');
        });
        await bob.until('bob sees a successor', (hw) => hw.lobby().players.some((p) => p.successor));
        const l = await host.ev((hw) => hw.lobby());
        assert(l.players.find((p) => p.successor)?.id === 'acct-ann', 'the longest-connected member (ann) is the successor');
      });
      await step('commands round-trip and the three worlds converge', async () => {
        await ann.ev((hw, c) => hw.dispatch(c), place('cottage', spot(SIZE, 1)));
        await bob.ev((hw, c) => hw.dispatch(c), place('road', spot(SIZE, 2)));
        await host.ev((hw, c) => hw.dispatch(c), place('road', spot(SIZE, 3)));
        for (const p of [host, ann, bob]) await p.until('3 buildings', (hw) => hw.summary().buildings.length === 3);
        await agree(host, ann);
        await agree(host, bob);
      });
      await step("a refused command comes back to the peer that issued it, and to nobody else", async () => {
        // The host builds on a tile in the same tick ann builds on it: ann predicts success, the host says no.
        const t = spot(SIZE, 1, 2);
        await host.ev((hw, c) => hw.dispatch(c), place('road', t));
        await ann.ev((hw, c) => hw.dispatch(c), place('cottage', t));
        await ann.until('ann is told', (hw) => hw.rejected().some((e) => e.reason === 'occupied'));
        const [onAnn, onBob, onHost] = await Promise.all([ann, bob, host].map((p) => p.ev((hw) => hw.rejected() as { reason: string; playerId: string }[])));
        assert(onAnn.length === 1 && onAnn[0].playerId === 'acct-ann', `ann: ${JSON.stringify(onAnn)}`);
        assert(onBob.length === 0, `bob heard about ann's refusal: ${JSON.stringify(onBob)}`);
        assert(onHost.length === 0, `the host was toasted ann's refusal: ${JSON.stringify(onHost)}`);
        for (const p of [host, ann, bob]) await p.until('4 buildings', (hw) => hw.summary().buildings.length === 4);
        await agree(host, ann);
      });
      const before = await host.ev((hw) => hw.summary());
      note(`before the crash: tick ${before.tick}, ${before.buildings.length} buildings, money ${JSON.stringify(moneys(before))}`);

      await step('the host browser is SIGKILLed: ann is promoted, bob rebinds', async () => {
        h.hostProc.kill();
        await ann.until('ann hosts', (hw) => hw.lobby().role === 'host' && hw.lobby().phase === 'hosting', 40_000);
        await bob.until('bob follows ann', (hw) => hw.lobby().phase === 'member' && hw.peerReady() && hw.lobby().players.find((p) => p.host)?.id === 'acct-ann', 40_000);
      });
      await step('money and buildings survived the migration', async () => {
        const a = await ann.ev((hw) => hw.summary());
        const b = await bob.ev((hw) => hw.summary());
        assert(JSON.stringify(a.buildings) === JSON.stringify(before.buildings), `ann's buildings ${a.buildings} vs ${before.buildings}`);
        for (const id of ['acct-ann', 'acct-bob', 'acct-host']) {
          assert(a.players[id], `${id} is still in the world`);
          assert(a.players[id].money === before.players[id].money, `${id} money ${a.players[id].money} vs ${before.players[id].money}`);
        }
        assert(b.buildings.length === before.buildings.length, 'bob sees the same buildings');
        await agree(ann, bob);
      });
      await step('play continues under the new host', async () => {
        await bob.ev((hw, c) => hw.dispatch(c), place('road', spot(SIZE, 1, 1)));
        for (const p of [ann, bob]) await p.until('5 buildings', (hw) => hw.summary().buildings.length === 5);
        await agree(ann, bob);
      });
      const cat = await h.newPlayer('cat', A.cat, { size: SIZE });
      await step('a late joiner joins the NEW host by the same code', async () => {
        await joinRoom(cat, code);
        await cat.until('sees 5 buildings', (hw) => hw.summary().buildings.length === 5);
        await agree(ann, cat);
      });
      await step('the new host leaves gracefully: bob takes over, cat rebinds', async () => {
        await ann.ev((hw) => hw.leave());
        await bob.until('bob hosts', (hw) => hw.lobby().role === 'host' && hw.lobby().phase === 'hosting', 30_000);
        await cat.until('cat follows bob', (hw) => hw.lobby().phase === 'member' && hw.peerReady() && hw.lobby().players.find((p) => p.host)?.id === 'acct-bob', 30_000);
        await cat.ev((hw, c) => hw.dispatch(c), place('road', spot(SIZE, 2, 1)));
        for (const p of [bob, cat]) await p.until('6 buildings', (hw) => hw.summary().buildings.length === 6);
        await agree(bob, cat);
      });
    },
  },

  big: {
    about: 'a 96x96 world: the snapshot is many 16 KB fragments; two members join at once',
    async run(h) {
      const SIZE = 96;
      const host = await h.newPlayer('host', A.host, { proc: 'host', size: SIZE });
      const ann = await h.newPlayer('ann', A.ann, { size: SIZE });
      const bob = await h.newPlayer('bob', A.bob, { size: SIZE });
      const code = await step('host creates the room', () => startRoom(host));
      const bytes = await host.ev((hw) => hw.snapshotBytes() as number);
      note(`snapshot: ${bytes} bytes = ${Math.ceil(bytes / 16_000)} fragments`);
      await step('two members join concurrently', async () => {
        await Promise.all([joinRoom(ann, code), joinRoom(bob, code)]);
        await agree(host, ann);
        await agree(host, bob);
      });
      await step('a burst of 30 commands from the three sides stays consistent', async () => {
        const c = Math.floor(SIZE / 2);
        for (let i = 0; i < 10; i++) {
          await ann.ev((hw, p) => hw.dispatch(p), place('road', { x: c + 1 + i, z: c }));
          await bob.ev((hw, p) => hw.dispatch(p), place('road', { x: c + 1 + i, z: c + 1 }));
          await host.ev((hw, p) => hw.dispatch(p), place('road', { x: c + 1 + i, z: c + 2 }));
        }
        await sleep(2500);
        const s = await host.ev((hw) => hw.summary());
        note(`${s.buildings.length} buildings placed`);
        for (const p of [ann, bob]) await p.until('same building count', (hw, n) => hw.summary().buildings.length === n, 20_000, s.buildings.length);
        await agree(host, ann);
        await agree(host, bob);
      });
      await step('a late joiner receives the big snapshot while play continues', async () => {
        const cat = await h.newPlayer('cat', A.cat, { size: SIZE });
        await joinRoom(cat, code);
        await agree(host, cat);
      });
    },
  },

  flood: {
    about: 'a member floods commands: rate-limited by the host, never disconnected, its prediction does not stick',
    async run(h) {
      const SIZE = 48;
      const host = await h.newPlayer('host', A.host, { proc: 'host', size: SIZE });
      const ann = await h.newPlayer('ann', A.ann, { size: SIZE });
      const code = await startRoom(host);
      await joinRoom(ann, code);
      await step('300 commands in one burst', async () => {
        await ann.ev((hw) => {
          for (let i = 0; i < 300; i++) hw.dispatch({ type: 'move', x: 20 + (i % 7), z: 20 });
        });
        await sleep(2500);
        const l = await ann.ev((hw) => hw.lobby());
        assert(l.phase === 'member', 'the flooder is still connected');
        const st = await host.ev((hw) => hw.linkStats());
        assert(st && 'stats' in st && st.stats, 'the host reports its stats');
        note(`host stats: ${JSON.stringify(st.stats)}`);
        assert(st.stats.rateLimited > 0, 'the host rate-limited the flood');
      });
      await step("the flooder's predicted state does not outlive the flood", async () => {
        await ann.until('nothing pending', (hw) => hw.pendingCount() === 0, 15_000);
        await agree(host, ann);
      });
      await step('a legitimate command still works afterwards', async () => {
        await ann.ev((hw, c) => hw.dispatch(c), place('road', spot(SIZE, 1)));
        await host.until('road', (hw) => hw.summary().buildings.length === 1);
        await agree(host, ann);
      });
    },
  },

  'hub-restart': {
    about: 'the hub restarts mid-game: sockets reconnect, the host re-claims the room, members re-join',
    async run(h) {
      const SIZE = 32;
      const host = await h.newPlayer('host', A.host, { proc: 'host', size: SIZE });
      const ann = await h.newPlayer('ann', A.ann, { size: SIZE });
      const bob = await h.newPlayer('bob', A.bob, { size: SIZE });
      const code = await startRoom(host);
      await joinRoom(ann, code);
      await joinRoom(bob, code);
      await step('the hub restarts (all rooms forgotten); the links never notice', async () => {
        await h.restartHub();
        await ann.ev((hw, c) => hw.dispatch(c), place('cottage', spot(SIZE, 1)));
        await host.until('ann built', (hw) => hw.summary().buildings.length === 1, 15_000);
        await bob.until('bob sees it', (hw) => hw.summary().buildings.length === 1, 15_000);
      });
      await step("everyone is back in the hub's roster and the room is joinable again", async () => {
        await host.until('3 players, room re-claimed', (hw) => hw.lobby().phase === 'hosting' && hw.lobby().players.length === 3, 30_000);
        for (const p of [ann, bob]) await p.until('still a member', (hw) => hw.lobby().phase === 'member' && hw.lobby().players.length === 3, 30_000);
        const cat = await h.newPlayer('cat', A.cat, { size: SIZE });
        await joinRoom(cat, code);
        await agree(host, cat);
        await agree(host, ann);
        await agree(host, bob);
      });
    },
  },

  lock: {
    about: 'a password-locked room: wrong / missing password refused by the real hub, right one admitted, lock kept across a host crash',
    async run(h) {
      const SIZE = 32;
      const PW = 'swordfish';
      const host = await h.newPlayer('host', A.host, { proc: 'host', size: SIZE });
      const ann = await h.newPlayer('ann', A.ann, { size: SIZE });
      const bob = await h.newPlayer('bob', A.bob, { size: SIZE });
      const cat = await h.newPlayer('cat', A.cat, { size: SIZE });
      const code = await step('host creates a locked room; the list says locked, never the password', async () => {
        const c = await startRoom(host, { password: PW });
        await ann.ev((hw) => hw.refreshRooms());
        await ann.until('room listed', (hw) => hw.lobby().rooms.length === 1);
        const rooms = await ann.ev((hw) => hw.lobby().rooms);
        assert(rooms[0].locked === true && !JSON.stringify(rooms).includes(PW), `room list: ${JSON.stringify(rooms)}`);
        return c;
      });
      await step('no password / a wrong password is refused', async () => {
        await ann.ev((hw, c) => hw.join(c), code);
        await ann.until('password-required', (hw) => hw.lobby().error === 'password-required');
        await ann.ev((hw, a) => hw.join(a.code, a.pw), { code, pw: 'not it' });
        await ann.until('wrong-password', (hw) => hw.lobby().error === 'wrong-password');
        const k = await ann.ev((hw) => hw.sessionKind());
        assert(k === null, 'no half-open session');
      });
      await step('the right password is admitted over real WebRTC', async () => {
        await joinRoom(ann, code, PW);
        await joinRoom(bob, code, PW);
        await agree(host, ann);
      });
      await step('the host crashes; the lock holds under the new host', async () => {
        h.hostProc.kill();
        await ann.until('ann hosts', (hw) => hw.lobby().role === 'host' && hw.lobby().phase === 'hosting', 40_000);
        await bob.until('bob follows', (hw) => hw.lobby().phase === 'member' && hw.peerReady(), 40_000);
        await cat.ev((hw, c) => hw.join(c), code);
        await cat.until('password-required', (hw) => hw.lobby().error === 'password-required');
        await joinRoom(cat, code, PW);
        await agree(ann, cat);
      });
    },
  },

  motion: {
    about: 'a walking member is drawn smoothly on the host (interpolated), not in 100 ms steps',
    async run(h) {
      const SIZE = 48;
      const host = await h.newPlayer('host', A.host, { proc: 'host', size: SIZE });
      const ann = await h.newPlayer('ann', A.ann, { size: SIZE });
      const code = await startRoom(host);
      await joinRoom(ann, code);
      await step('ann walks 4 tiles at 10 Hz of move commands; the host draws her smoothly', async () => {
        const start = Math.floor(SIZE / 2);
        const rec = host.ev((hw, a) => hw.recordMotion(a, 2600), 'acct-ann');
        await sleep(300);
        await ann.ev((hw, a) => hw.walk(a.x, a.z, 0.2, 20, 100), { x: start, z: start });
        const { raw, drawn, speed } = (await rec) as { raw: number[]; drawn: number[]; speed: number[] };
        const maxStep = (xs: number[]) => xs.slice(1).reduce((m, x, i) => Math.max(m, Math.abs(x - xs[i])), 0);
        const rawStep = maxStep(raw);
        const drawnStep = maxStep(drawn);
        note(`${raw.length} frames; largest per-frame jump: world ${rawStep.toFixed(3)} tiles, drawn ${drawnStep.toFixed(3)} tiles; top speed ${Math.max(...speed).toFixed(2)} tiles/s`);
        assert(raw.length > 60, 'recorded frames');
        assert(drawnStep < rawStep * 0.5, 'the drawn avatar moves in smaller steps than the world position');
        assert(Math.abs(Math.max(...speed) - 2) < 1.2, 'speed is about 2 tiles/s (0.2 per 100 ms)');
        const end = drawn[drawn.length - 1];
        assert(Math.abs(end - (start + 4)) < 0.05, `she ends where she stopped (${end} vs ${start + 4})`);
      });
    },
  },

  freeze: {
    about: 'the host is FROZEN (SIGSTOP), not killed: nothing closes, the hub notices only by its heartbeat (production 25s/20s)',
    slow: true,
    hub: { pingIntervalMs: 25_000, pingTimeoutMs: 20_000 },
    async run(h) {
      const SIZE = 32;
      const host = await h.newPlayer('host', A.host, { proc: 'host', size: SIZE });
      const ann = await h.newPlayer('ann', A.ann, { size: SIZE });
      const bob = await h.newPlayer('bob', A.bob, { size: SIZE });
      const code = await startRoom(host);
      await joinRoom(ann, code);
      await joinRoom(bob, code);
      await ann.ev((hw, c) => hw.dispatch(c), place('cottage', spot(SIZE, 1)));
      await bob.until('bob sees it', (hw) => hw.summary().buildings.length === 1);
      const t0 = Date.now();
      await step('the host freezes; the members recover within a minute', async () => {
        h.hostProc.freeze();
        await ann.until('ann hosts', (hw) => hw.lobby().role === 'host' && hw.lobby().phase === 'hosting', 80_000);
        await bob.until('bob follows ann', (hw) => hw.lobby().phase === 'member' && hw.peerReady() && hw.lobby().players.find((p) => p.host)?.id === 'acct-ann', 80_000);
        note(`recovered ${(Date.now() - t0) / 1000} s after the freeze`);
      });
      await step('play continues; the thawed old host is told it was replaced', async () => {
        await bob.ev((hw, c) => hw.dispatch(c), place('road', spot(SIZE, 2)));
        for (const p of [ann, bob]) await p.until('2 buildings', (hw) => hw.summary().buildings.length === 2);
        await agree(ann, bob);
        h.hostProc.thaw();
        await host.until('the old host stops hosting', (hw) => hw.lobby().phase !== 'hosting' || hw.lobby().role !== 'host', 30_000);
      });
    },
  },
};

const DEFAULT = ['core', 'big', 'flood', 'hub-restart', 'lock', 'motion'];

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    for (const [k, v] of Object.entries(SCENARIOS)) console.log(`${k.padEnd(14)} ${v.slow ? '(slow) ' : ''}${v.about}`);
    return;
  }
  const names = args.filter((a) => !a.startsWith('--'));
  const run = names.length ? names : DEFAULT;
  for (const n of run) if (!SCENARIOS[n]) throw new Error(`unknown scenario ${n} (try --list)`);
  const failures: string[] = [];
  for (const name of run) {
    const sc = SCENARIOS[name];
    console.log(`\n  ${name}: ${sc.about}`);
    const h = await startHarness(ACCOUNTS, sc.hub);
    try {
      await sc.run(h);
    } catch (err) {
      failures.push(`${name}: ${(err as Error).message}`);
      for (const p of h.players) {
        if (p.page.isClosed()) continue;
        // A frozen or dead page never answers: give it a moment.
        const dump = await Promise.race([
          p
            .ev((hw) => ({ lobby: hw.lobby(), summary: hw.summary(), session: hw.sessionKind(), rejected: hw.rejected(), logs: hw.logs().slice(-10) }))
            .catch(() => null),
          sleep(3_000).then(() => '(no answer)'),
        ]);
        console.error(`\n--- ${p.label} ---\n${JSON.stringify(dump).slice(0, 1800)}`);
      }
    } finally {
      for (const p of h.players) if (p.errors.length) console.log(`         page errors in ${p.label}: ${p.errors.slice(0, 3).join(' | ')}`);
      await h.close();
    }
  }
  if (failures.length) {
    console.error(`\nhearthworks e2e FAILED:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`\nhearthworks e2e: ${stepCount} steps passed (${run.join(', ')})`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
