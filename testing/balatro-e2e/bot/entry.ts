/**
 * The bot-peer page (PLAN §4 WS14, §6.3 E2E-22): the real multiplayer session runtime
 * (lib/balatro/mp/lobby/runtime.ts, the games-hub client, WebRTC) with a scripted
 * virtual player in place of the game — no love.wasm, no WebGL — so one machine can
 * fill a lobby of up to 16 with a couple of real browsers and a dozen bots.
 *
 * Bundled by testing/balatro-e2e/lib/bot.ts with esbuild and served at the app's own
 * origin through Playwright routing (so the signed-in context's cookies reach the hub).
 *
 * The scripted player (BotLua) speaks the Lua side of the mailbox (bridge-protocol.ts):
 * it readies in lobbies, reports a set_ante / blind results / ready_blind for every ante,
 * answers start_blind with one play_hand of its configured score, and follows end_pvp
 * into the next ante — the same events the real game sends (rmh_mp/hooks/flow.lua,
 * pvp_blind.lua), in the same order, minus the cards. Its surface for Playwright:
 *
 *   window.__balatroBot = { ui(type, data), state(), sent(type?), outcomes(), setScore(n), stop() }
 */
import pack from '../../../lib/balatro/game-pack.json';
import { MP_PROTOCOL_VERSION } from '../../../lib/balatro/net/limits';
import { createHubClient } from '../../../lib/balatro/mp/hub-client';
import { webrtcConnector } from '../../../lib/balatro/mp/transport/connector';
import { realScheduler, type BridgeLike } from '../../../lib/balatro/mp/transport/types';
import { memoryKv } from '../../../lib/balatro/mp/history';
import { memorySnapshotStore } from '../../../lib/balatro/mp/rejoin/rejoin-store';
import { cryptoSeed, cryptoSeedString } from '../../../lib/balatro/mp/rng';
import { MpRuntime } from '../../../lib/balatro/mp/lobby/runtime';
import { attach as attachQueue } from '../../../lib/balatro/mp/queue/attach';
import { attach as attachReplay } from '../../../lib/balatro/mp/replay/attach';
import type { J2LData, J2LType, L2JData, L2JType } from '../../../lib/balatro/mp/bridge-protocol';
import type { RefMsg } from '../../../lib/balatro/mp/types';

type Handler = (d: unknown) => void;

function contentHash(): string {
  const p = pack as { core: { sha256: string }; mp?: { sha256: string } };
  return `${p.core.sha256.slice(0, 12)}${(p.mp?.sha256 ?? '0'.repeat(12)).slice(0, 12)}-v${MP_PROTOCOL_VERSION}`;
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return [...bytes].map((b) => abc[b % abc.length]).join('');
}

/** The virtual player: what Lua would send, driven by what JS tells Lua. */
class BotLua implements BridgeLike {
  readonly log: { t: string; d: unknown; at: number }[] = [];
  private handlers = new Map<string, Set<Handler>>();
  private seq = 0;
  score = '100';
  hands = 4;
  autoReady = true;
  me: string | null = null;
  ante = 0;
  inMatch = false;
  over = false;
  private readied = new Set<number>();
  private played = new Set<number>();

  send<T extends J2LType>(t: T, d: J2LData<T>): number {
    this.log.push({ t, d, at: Date.now() });
    if (this.log.length > 5000) this.log.splice(0, 1000);
    // React on the next tick, as Lua does on its next frame.
    setTimeout(() => this.react(t, d as never), 30);
    return ++this.seq;
  }

  on<T extends L2JType>(t: T, fn: (d: L2JData<T>) => void): () => void {
    let set = this.handlers.get(t);
    if (!set) this.handlers.set(t, (set = new Set()));
    set.add(fn as Handler);
    return () => void set.delete(fn as Handler);
  }

  emit<T extends L2JType>(t: T, d: L2JData<T>): void {
    for (const fn of [...(this.handlers.get(t) ?? [])]) fn(d);
  }

  private ev(e: L2JData<'ev'>['e']) {
    this.emit('ev', { e });
  }

  private flags(state: string, onPvp = false) {
    this.emit('flags', {
      state,
      onPvp,
      ready: false,
      countdown: false,
      animBusy: false,
      paused: false,
      inShop: state === 'SHOP',
      roundEval: false,
      handsLeft: this.hands,
      ante: this.ante,
      blindKey: null,
    });
  }

  /** A new ante: the two normal blinds beaten, then Ready on the PvP pillar. */
  private playAnte(ante: number) {
    if (this.over || this.readied.has(ante)) return;
    this.readied.add(ante);
    this.ante = ante;
    this.ev({ t: 'set_ante', ante });
    this.flags('BLIND_SELECT');
    for (const blind of ['Small', 'Big'] as const) {
      this.ev({ t: 'play_hand', score: '0', hands_left: this.hands, skips: 0 });
      this.ev({ t: 'new_round' });
      this.ev({ t: 'blind_result', ante, blind, beaten: true });
    }
    this.ev({ t: 'ready_blind', starting_hands: this.hands });
  }

  private react<T extends J2LType>(t: T, d: J2LData<T>) {
    if (t === 'lobby_view') {
      const v = d as J2LData<'lobby_view'>;
      this.me = v.me;
      const me = v.state.players.find((p) => p.id === this.me);
      if (this.autoReady && !v.isHost && me && !me.ready && !v.state.started) this.emit('ui_ready', { ready: true });
    } else if (t === 'match_start') {
      const m = d as J2LData<'match_start'>;
      this.me = m.me;
      this.inMatch = true;
      this.over = false;
      this.readied.clear();
      this.played.clear();
      this.ev({ t: 'set_ante', ante: 0 });
      this.playAnte(1);
    } else if (t === 'outcome') {
      this.onOutcome((d as J2LData<'outcome'>).o);
    }
  }

  private onOutcome(o: RefMsg) {
    if (o.t === 'start_blind') {
      if (this.played.has(this.ante)) return;
      this.played.add(this.ante);
      this.flags('SELECTING_HAND', true);
      this.ev({ t: 'play_hand', score: this.score, hands_left: 0, skips: 0 });
    } else if (o.t === 'end_pvp') {
      if (!this.played.has(this.ante)) return;
      this.flags('SHOP');
      this.playAnte(this.ante + 1);
    } else if (o.t === 'win' || (o.t === 'eliminated' && o.player_id === this.me)) {
      this.over = true;
    }
  }
}

const lua = new BotLua();
const params = new URLSearchParams(location.search);
if (params.get('score')) lua.score = params.get('score')!;
const hub = createHubClient((m) => console.warn(`[bot] ${m}`));
const runtime = new MpRuntime(
  {
    bridge: lua,
    hub,
    // ?block=1: drop every local ICE candidate (with the peer blocking too, no direct path can
    // form, so the pair falls back to the hub relay — E2E-15).
    connector: webrtcConnector(new URLSearchParams(location.search).get('block') === '1' ? { blockCandidates: true } : undefined),
    sched: realScheduler(),
    fs: null,
    kv: memoryKv(),
    snapshots: memorySnapshotStore(),
    contentHash: contentHash(),
    testBuild: true,
    randomId,
    randomSeed: cryptoSeedString,
    randomInt: cryptoSeed,
    log: (m, isError) => (isError ? console.warn(`[mp] ${m}`) : undefined),
  },
  { intent: 'menu', invite: null },
);

// The same extensions lib/balatro/mp/index.ts loads (matchmaking/party/invites; replays and
// spectating), so a bot can queue, party up and be watched.
const detach = [attachQueue(runtime), attachReplay(runtime)];

declare global {
  interface Window {
    __balatroBot?: unknown;
  }
}

window.__balatroBot = {
  /** Sends a Lua→JS message as the game's UI would (ui_join, ui_ready, ui_create_lobby …). */
  ui: (t: L2JType, d: unknown) => lua.emit(t, d as never),
  state: () => runtime.snapshot(),
  sent: (t?: string) => lua.log.filter((m) => !t || m.t === t).map((m) => m.d),
  outcomes: () => lua.log.filter((m) => m.t === 'outcome').map((m) => (m.d as { o: RefMsg }).o),
  setScore: (n: string) => {
    lua.score = n;
  },
  setAutoReady: (on: boolean) => {
    lua.autoReady = on;
  },
  stop: () => {
    for (const fn of detach) fn();
    runtime.stop();
    hub.destroy();
  },
};
