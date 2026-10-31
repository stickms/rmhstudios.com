/**
 * The multiplayer session runtime (WS5): one per opened MP pack, wired to Lua
 * through the WS3 mailbox and to the games hub, holding at most one role
 * (lobby host or member/spectator) or a practice session at a time, plus the
 * match that outlives a role change.
 *
 * Lua → runtime (bridge-protocol.ts L2J): lobby intents (`ui_*`), game events
 * (`ev`), peer messages (`peer`), timer inputs (`flags`, `timer_input`), run
 * snapshots (`snapshot`) and `match_left`. Runtime → Lua: `net_status`,
 * `lobby_view`, `lobby_error`, `match_start`/`practice_start`, `outcome`,
 * `peer`, `timer_state`, `presence`, `chat_line`, `rejoin_restore`, `tail`,
 * `end_data`, `history`, `glyphs`.
 *
 * Browser-free: index.ts supplies the browser seams (hub client, WebRTC,
 * IndexedDB, localStorage, the engine FS); the tests supply in-memory ones.
 */

import { rejoinHint, setRejoinHint } from '../rejoin/catchup';
import type { J2LData, L2JData } from '../bridge-protocol';
import { BRIDGE_PATHS } from '../bridge-codec';
import { Chat } from '../chat';
import { glyphsFor, guessLang, parseGlyphs, type GlyphTable } from '../identity';
import { kvGet, kvSet, readHistory, recordResult } from '../history';
import { MatchClient, type ResultKind } from '../match/match-member';
import { RefereeDriver } from '../match/match-host';
import { defaultOptionsFor, shapeFor } from '../rulesets/options';
import { resolveRuleset } from '../rulesets/resolve';
import type { PeerKind, WireData } from '../wire';
import type { GameEvent, Id, LobbyState, PlayerResult, RefCheckpoint, StartedMatch } from '../types';
import type { HubStatus } from '../transport/types';
import type { ReplayTap } from '../replay/tap';
import { DEFAULT_SETTINGS, type MpSettings, type Role, type RoleCtx, type RuntimeDeps } from './context';
import { HubGate } from './hub-gate';
import { LobbyHost } from './lobby-host';
import { LobbyMember } from './lobby-member';

export const SETTINGS_KEY = 'rmh-balatro-mp-settings';
/** At most this many site blocks are seeded as chat mutes. */
export const MAX_SEEDED_MUTES = 512;

export type StartIntent = 'menu' | 'join' | 'rejoin' | 'invite';

interface Practice {
  driver: RefereeDriver;
  client: MatchClient;
}

export interface RuntimeSnapshot {
  me: string | null;
  role: 'host' | 'member' | 'spectator' | 'practice' | null;
  code: string | null;
  lobby: LobbyState | null;
  runId: string | null;
  hub: HubStatus;
  lastHs: number;
  result: ResultKind | null;
  target: string | null;
  lives: Record<string, number>;
  checkpointSeq: number | null;
}

export class MpRuntime {
  me: Id | null = null;
  name = 'Player';
  avatarUrl: string | null = null;
  role: Role | null = null;
  client: MatchClient | null = null;
  /** WS13 (replay/attach.ts): relayed logs, spectator catch-up and the watched match. */
  replayTap: ReplayTap | null = null;
  practice: Practice | null = null;
  /**
   * Extension hooks (queue/attach.ts). `practiceGuard` returns a lobby_error
   * code that refuses Practice (PR-05: never while searching); `joinHook`
   * may take over a `ui_join` (true = handled; MM-06 party reclaim);
   * `roleEndHook` sees why a role ended before Lua is told (true = it is
   * handled, no lobby_error; the "Return to lobby" join retry).
   */
  practiceGuard: (() => string | null) | null = null;
  joinHook: ((code: string) => boolean) | null = null;
  roleEndHook: ((why: string, code: string | null) => boolean) | null = null;
  settings: MpSettings;
  readonly chat: Chat;
  readonly lang: string;
  private glyphTable: GlyphTable | null = null;
  private glyphsLoaded = false;
  private checkpoint: RefCheckpoint | null = null;
  private hubStatus: HubStatus;
  private held: { code: string; runId: string | null } | null = null;
  /** A rejoin seat query waiting for the hub to connect (boot, NET-06). */
  private seatQueryPending = false;
  private awaitingCatchUp = false;
  private readonly results: Record<Id, PlayerResult> = {};
  private localDeck: WireData<'deck_res'> | null = null;
  private localStats: WireData<'stats_res'> | null = null;
  private readonly offs: (() => void)[] = [];
  /** Ids muted because the site block list has them (not saved with the player's own mutes). */
  private readonly siteBlocked = new Set<string>();
  private stopped = false;
  /** NET-09: the page's tab is hidden (handed to every new role). */
  private hidden = false;
  private ready: Promise<void>;
  /**
   * The hub as the roles see it: a host's drained `leave` goes out before any later
   * emit (Create / Join / the seat prompt), or the hub would still see the old seat.
   */
  private readonly hubGate: HubGate;
  private readonly roleDeps: RuntimeDeps;

  constructor(
    readonly deps: RuntimeDeps,
    private readonly opts: { intent: StartIntent; invite: string | null; lang?: string },
  ) {
    this.hubGate = new HubGate(deps.hub, deps.sched);
    // Every other dep reads through to `deps` itself (a live view, not a copy).
    this.roleDeps = Object.create(deps, { hub: { value: this.hubGate, enumerable: true } }) as RuntimeDeps;
    this.settings = this.loadSettings();
    this.lang = opts.lang ?? guessLang();
    this.chat = new Chat({ now: () => deps.sched.mono(), glyphs: () => this.glyphs() });
    this.chat.enabled = this.settings.chat;
    for (const id of this.settings.muted) this.chat.mute(id, true);
    this.hubStatus = deps.hub.status;
    this.bindBridge();
    this.bindHub();
    this.ready = this.boot();
  }

  /** Resolves once the account is known (the first intents wait for it). */
  whenReady(): Promise<void> {
    return this.ready;
  }

  private async boot(): Promise<void> {
    const acct = await this.deps.hub.account().catch(() => null);
    if (this.stopped) return;
    if (acct) {
      this.me = acct.id;
      this.name = acct.name;
      this.avatarUrl = acct.avatarUrl;
    }
    this.pushNetStatus();
    if (acct) this.seedBlockedMutes();
    this.deps.bridge.send('history', readHistory(this.deps.kv));
    this.loadGlyphs();
    const { intent, invite } = this.opts;
    if (invite) this.joinCode(invite, 'player');
    else if (intent === 'rejoin' || rejoinHint(this.deps.kv)) {
      // NET-06: the hub drops an emit made before the socket is up (a fresh page load
      // usually resolves the account first), so the query waits for 'connected'.
      this.seatQueryPending = true;
      this.querySeat();
    }
  }

  /** Sends the pending seat query once the hub is connected (bindHub retries on connect). */
  private querySeat(): void {
    if (!this.seatQueryPending || this.stopped || this.deps.hub.status !== 'connected') return;
    this.seatQueryPending = false;
    this.hubGate.emit('balatro:seat:query', {});
  }

  /** Site blocks become chat mutes for this session (never written to the saved mute list). */
  private seedBlockedMutes(): void {
    const load = this.deps.blockedIds;
    if (!load) return;
    load().then(
      (ids) => {
        if (this.stopped || !Array.isArray(ids)) return;
        for (const id of ids.slice(0, MAX_SEEDED_MUTES)) {
          if (typeof id !== 'string' || id.length === 0 || id.length > 64) continue;
          this.siteBlocked.add(id);
          this.chat.mute(id, true);
        }
      },
      (err) => this.deps.log(`[mp] block list unavailable: ${String(err)}`),
    );
  }

  /* ─── Settings, glyphs, status ─── */

  private loadSettings(): MpSettings {
    const raw = kvGet(this.deps.kv, SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, muted: [] };
    try {
      const o = JSON.parse(raw) as Partial<MpSettings>;
      const s: MpSettings = { ...DEFAULT_SETTINGS, muted: [] };
      if (typeof o.avatarJoker === 'string' && /^j_[a-z0-9_]{1,40}$/.test(o.avatarJoker)) s.avatarJoker = o.avatarJoker;
      if (Number.isInteger(o.blindCol) && (o.blindCol as number) >= 1 && (o.blindCol as number) <= 25) s.blindCol = o.blindCol as number;
      if (o.timerSound === 'always' || o.timerSound === 'once' || o.timerSound === 'off') s.timerSound = o.timerSound;
      if (typeof o.chat === 'boolean') s.chat = o.chat;
      if (o.nemesisLayout === 'standard' || o.nemesisLayout === 'mirrored' || o.nemesisLayout === 'classic') s.nemesisLayout = o.nemesisLayout;
      if (typeof o.showMpContent === 'boolean') s.showMpContent = o.showMpContent;
      if (Array.isArray(o.muted)) s.muted = o.muted.filter((x): x is string => typeof x === 'string' && x.length <= 64).slice(0, 256);
      return s;
    } catch {
      return { ...DEFAULT_SETTINGS, muted: [] };
    }
  }

  private saveSettings(): void {
    kvSet(this.deps.kv, SETTINGS_KEY, JSON.stringify(this.settings));
  }

  private loadGlyphs(): void {
    if (this.glyphsLoaded) return;
    const fs = this.deps.fs;
    if (!fs) return;
    try {
      if (!fs.analyzePath(BRIDGE_PATHS.GLYPHS).exists) return;
      const bytes = fs.readFile(BRIDGE_PATHS.GLYPHS);
      this.glyphTable = typeof bytes === 'string' ? null : parseGlyphs(bytes);
      this.glyphsLoaded = true;
      const font = this.glyphTable?.fonts[this.glyphTable.langs.get(this.lang) ?? 0]?.name ?? 'unknown';
      this.deps.bridge.send('glyphs', { fontKey: font.slice(0, 64), path: BRIDGE_PATHS.GLYPHS });
    } catch (err) {
      this.deps.log(`[mp] glyph table unreadable: ${String(err)}`, true);
    }
  }

  glyphs(): Uint8Array | null {
    if (!this.glyphsLoaded) this.loadGlyphs();
    return glyphsFor(this.glyphTable, this.lang);
  }

  private pushNetStatus(reason?: string): void {
    const d: J2LData<'net_status'> = {
      hub: this.hubStatus,
      account: { name: this.name.slice(0, 64), avatarUrl: this.avatarUrl },
    };
    if (reason) d.reason = reason.slice(0, 64);
    this.deps.bridge.send('net_status', d);
  }

  /* ─── The role context ─── */

  private ctx(): RoleCtx {
    return {
      deps: this.roleDeps,
      me: this.me as Id,
      name: this.name,
      avatarUrl: this.avatarUrl,
      settings: this.settings,
      chat: this.chat,
      lang: this.lang,
      glyphs: () => this.glyphs(),
      view: (state, isHost, block) => {
        const d: { state: LobbyState; me: Id; isHost: boolean; canStart: boolean; startBlockReason?: string } = {
          state,
          me: this.me as Id,
          isHost,
          canStart: isHost && !block,
        };
        if (isHost && block) d.startBlockReason = block;
        this.deps.bridge.send('lobby_view', d);
      },
      error: (code) => this.error(code),
      client: () => this.client,
      beginMatch: (match, how, logNext) => this.beginMatch(match, how, logNext),
      heldCheckpoint: () => this.checkpoint,
      holdCheckpoint: (cp) => {
        if (!this.checkpoint || cp.runId !== this.checkpoint.runId || cp.seq > this.checkpoint.seq) this.checkpoint = cp;
      },
      roleEnded: (why) => this.roleEnded(why),
      promoted: (p, lobby) => this.promoted(p, lobby),
      demoted: (code) => this.demoted(code),
      replayTap: () => this.replayTap,
    };
  }

  private error(code: string): void {
    this.deps.bridge.send('lobby_error', { code: code.slice(0, 32) });
  }

  /* ─── Roles ─── */

  private requireAccount(): boolean {
    if (this.me) return true;
    this.error('auth-required');
    return false;
  }

  createLobby(
    queueMode: LobbyState['queueMode'],
    kind: LobbyState['kind'],
    reclaim?: { code: string; token: string },
  ): LobbyHost | null {
    if (!this.requireAccount()) return null;
    this.dropRole();
    const host = new LobbyHost(this.ctx());
    this.role = host;
    host.create(queueMode, kind, reclaim);
    if (this.hidden) host.setHidden(true);
    return host;
  }

  joinCode(code: string, role: 'player' | 'spectator', rejoinRunId: string | null = null): LobbyMember | null {
    if (!this.requireAccount()) return null;
    if (this.role?.code === code && this.role.kind === 'member') return this.role as LobbyMember;
    this.dropRole();
    const m = new LobbyMember(this.ctx(), { code, role, rejoinRunId });
    this.role = m;
    if (this.hidden) m.setHidden(true);
    return m;
  }

  private dropRole(): void {
    const r = this.role;
    this.role = null;
    if (r) {
      r.leave();
      r.stop();
    }
    this.endMatch();
    this.stopPractice();
  }

  private roleEnded(why: string): void {
    const endedCode = this.role?.code ?? null;
    this.role = null;
    if (why.startsWith('seat-held:')) {
      this.held = { code: why.slice('seat-held:'.length), runId: null };
      this.error('seat-held');
      return;
    }
    if (why !== 'left' && !this.roleEndHook?.(why, endedCode)) this.error(why);
    // Kicked, closed or refused while a match runs: the match is over for this peer.
    if (this.client && !this.client.result) this.endMatch();
  }

  private promoted(p: { code: string; token: string; ice: unknown }, lobby: LobbyState): void {
    if (this.stopped) return;
    const host = new LobbyHost(this.ctx());
    this.role = host;
    const mem = this.client
      ? { match: this.client.match, checkpoint: this.checkpoint?.runId === this.client.match.runId ? this.checkpoint : null, lastHs: this.client.lastHs }
      : null;
    this.deps.log(`[mp] promoted to host of ${p.code}`);
    host.adopt(p, lobby, mem, lobby.hostId);
    if (this.hidden) host.setHidden(true);
  }

  private demoted(code: string): void {
    const old = this.role;
    this.role = null;
    old?.stop();
    this.role = new LobbyMember(this.ctx(), { code, role: 'player', rejoinRunId: null });
    if (this.hidden) this.role.setHidden(true);
  }

  /* ─── The match on this peer ─── */

  private beginMatch(match: StartedMatch, how: 'start' | 'rejoin' | 'live', logNext?: number): void {
    const me = this.me as Id;
    if (how === 'live' && this.client?.match.runId === match.runId) return;
    if (how === 'rejoin') {
      const cp = this.checkpoint?.runId === match.runId ? this.checkpoint : null;
      const last = cp?.lastOutcome?.t;
      if (last === 'win' || last === 'player_won') return; // the match is over: nothing to restore
    }
    this.endMatch();
    this.stopPractice();
    for (const k of Object.keys(this.results)) delete this.results[k];
    this.localDeck = this.localStats = null;
    this.client = new MatchClient({
      sched: this.deps.sched,
      bridge: this.deps.bridge,
      match,
      me,
      cue: this.settings.timerSound,
      sendGame: (e) => this.role?.sendGame(e),
      sendPeer: (k, d, to) => this.role?.sendPeer(k, d, to),
      onResult: (kind) => this.onResult(match, kind),
      onPeer: (kind, from, d) => {
        if (kind === 'player_result') {
          this.results[from] = d as PlayerResult;
          if (this.client?.result) this.pushEndData();
        }
      },
      log: (m) => this.deps.log(m),
    });
    setRejoinHint(this.deps.kv, match.runId);
    // A reload rejoin: Lua's replay recorder continues this player's log at the host's count
    // of it, after the events the peers already hold (docs/balatro-mp.md §11).
    const resume = how === 'rejoin' && logNext !== undefined ? { logNext } : {};
    this.deps.bridge.send('match_start', { ...match, me, ...resume });
    if (how === 'rejoin') void this.restoreSnapshot(match.runId);
  }

  private async restoreSnapshot(runId: string): Promise<void> {
    const snap = await this.deps.snapshots?.get(runId).catch(() => null);
    const fs = this.deps.fs;
    if (!snap || !fs || this.client?.match.runId !== runId) {
      this.deps.log(`[mp] no snapshot for ${runId}: the run restarts from its seed`, true);
      this.awaitingCatchUp = true;
      return;
    }
    try {
      if (!fs.analyzePath('/rmh').exists) fs.mkdir('/rmh');
      if (!fs.analyzePath('/rmh/mp').exists) fs.mkdir('/rmh/mp');
      fs.writeFile(BRIDGE_PATHS.MP_RUN, snap.run);
      fs.writeFile(BRIDGE_PATHS.MP_STATE, snap.state);
    } catch (err) {
      this.deps.log(`[mp] writing the snapshot failed: ${String(err)}`, true);
      this.awaitingCatchUp = true;
      return;
    }
    this.awaitingCatchUp = true;
    this.deps.bridge.send('rejoin_restore', { runId, snapshotPath: BRIDGE_PATHS.MP_RUN, statePath: BRIDGE_PATHS.MP_STATE });
  }

  private onResult(match: StartedMatch, kind: ResultKind): void {
    this.deps.bridge.send('history', recordResult(this.deps.kv, kind));
    setRejoinHint(this.deps.kv, null);
    void this.deps.snapshots?.delete(match.runId);
    this.pushEndData();
  }

  private pushEndData(): void {
    const d: J2LData<'end_data'> = { players: { ...this.results } };
    if (this.localDeck) d.deck = this.localDeck;
    if (this.localStats) d.stats = this.localStats;
    this.deps.bridge.send('end_data', d);
  }

  private endMatch(): void {
    const c = this.client;
    this.client = null;
    this.awaitingCatchUp = false;
    if (!c) return;
    c.stop();
    if (!c.result) {
      // Left before the end: the seat is given up, nothing to rejoin.
      setRejoinHint(this.deps.kv, null);
      void this.deps.snapshots?.delete(c.match.runId);
    }
  }

  /* ─── Practice (PR-01/02, REF-24): a local session, no network ─── */

  startPractice(d: L2JData<'ui_practice'>): void {
    if (this.role) {
      this.error('practice-busy');
      return;
    }
    const block = this.practiceGuard?.() ?? null;
    if (block) {
      this.error(block);
      return;
    }
    let resolved;
    let options;
    try {
      ({ resolved, options } = resolveRuleset({ options: { ...defaultOptionsFor('pvp_nemesis'), ruleset: d.ruleset }, practice: true }));
    } catch {
      this.error('invalid');
      return;
    }
    this.stopPractice();
    this.endMatch();
    const me = this.me ?? 'me';
    const match: StartedMatch = {
      runId: this.deps.randomId(),
      seed: d.seed ?? this.deps.randomSeed(),
      stake: d.stake,
      mpStake: null,
      deck: d.deck,
      challenge: null,
      queueMode: 'pvp_nemesis',
      shape: shapeFor('pvp_nemesis', true),
      ruleset: options.ruleset,
      layers: resolved.layers,
      options,
      resolved,
      roster: [{ id: me, name: this.name.slice(0, 64), blindCol: this.settings.blindCol, avatarJoker: this.settings.avatarJoker }],
      startedAt: this.deps.sched.now(),
      hostId: me,
      contentHash: this.deps.contentHash,
    };
    let driver: RefereeDriver | null = null;
    const client = new MatchClient({
      sched: this.deps.sched,
      bridge: this.deps.bridge,
      match,
      me,
      sendGame: (e) => driver?.event(me, e),
      sendPeer: () => undefined,
      log: (m) => this.deps.log(m),
    });
    driver = new RefereeDriver({
      sched: this.deps.sched,
      match,
      emit: (to, msg, hs) => {
        if (to === '*' || to === me) client.outcome(msg, hs);
      },
      checkpoint: () => undefined,
      log: (m) => this.deps.log(`[mp practice] ${m}`, true),
    });
    this.practice = { driver, client };
    this.deps.bridge.send('practice_start', { resolved, deck: d.deck, stake: d.stake, seed: d.seed ?? null });
    driver.reset(this.deps.randomInt());
  }

  private stopPractice(): void {
    const p = this.practice;
    this.practice = null;
    p?.driver.stop();
    p?.client.stop();
  }

  /* ─── Lua → runtime ─── */

  private bindBridge(): void {
    const b = this.deps.bridge;
    const on = this.offs;
    const whenReady = <T>(fn: (d: T) => void) => (d: T) => void this.ready.then(() => !this.stopped && fn(d));
    on.push(
      b.on('ui_create_lobby', whenReady((d) => void this.createLobby(d.queueMode, d.kind))),
      b.on(
        'ui_join',
        whenReady((d) => {
          if (this.joinHook?.(d.code)) return;
          void this.joinCode(d.code, 'player');
        }),
      ),
      b.on('ui_spectate', whenReady((d) => void this.joinCode(d.code, 'spectator'))),
      b.on('ui_leave', () => {
        this.dropRole();
        this.held = null;
      }),
      b.on('ui_ready', (d) => this.role?.ready(d.ready)),
      b.on('ui_set_team', (d) => this.role?.setTeam(d.team)),
      b.on('ui_set_option', (d) => this.role?.hostIntent({ t: 'set_option', key: d.key, value: d.value })),
      b.on('ui_set_deck', (d) =>
        this.role?.hostIntent({ t: 'set_deck', deck: d.deck, stake: d.stake, mpStake: d.mpStake ?? null, challenge: d.challenge ?? null }),
      ),
      b.on('ui_start', () => this.role?.hostIntent({ t: 'start' })),
      b.on('ui_kick', (d) => this.role?.hostIntent({ t: 'kick', userId: d.userId })),
      b.on('ui_mute', (d) => {
        const on = d.on ?? !this.chat.muted.has(d.userId);
        this.chat.mute(d.userId, on);
        this.settings.muted = [...this.chat.muted].filter((id) => !this.siteBlocked.has(id)).slice(-256);
        this.saveSettings();
      }),
      b.on('ui_vote', (d) => this.role?.vote(d.stepId, d.option)),
      b.on('ui_draft', (d) => this.role?.draft(d.stepId, d.key)),
      b.on('ui_chat', (d) => this.role?.chat(d.text)),
      b.on('ui_practice', whenReady((d) => this.startPractice(d))),
      b.on('ui_settings', (d) => this.onSettings(d)),
      b.on('ui_return_lobby', () => {
        this.role?.hostIntent({ t: 'return_lobby' });
        if (this.client?.result) this.endMatch();
        const l = this.role?.lobby();
        if (l) this.ctx().view(l, this.role?.kind === 'host', null);
      }),
      b.on('ui_seat', whenReady((d) => this.onSeat(d.op))),
      b.on('ev', (d) => this.onLuaEvent(d.e)),
      b.on('peer', (d) => this.currentClient()?.luaPeer(d.k as PeerKind, d.d as never)),
      b.on('flags', (d) => {
        this.currentClient()?.luaFlags(d);
        if (this.awaitingCatchUp && d.ante > 0) {
          this.awaitingCatchUp = false;
          this.role?.caughtUp();
        }
      }),
      b.on('timer_input', (d) => this.currentClient()?.luaTimerInput(d.op)),
      b.on('snapshot', (d) => void this.onSnapshot(d.runId)),
      b.on('log', (d) => {
        const c = this.client;
        if (!c) return;
        for (let i = 0; i < d.batch.length; i += 50) {
          // `log` is a P>H>A broadcast like the peer kinds (replays, WS13); the roles relay it as one.
          this.role?.sendPeer('log' as PeerKind, { runId: c.match.runId, batch: d.batch.slice(i, i + 50) } as never, '*');
        }
      }),
      b.on('match_left', (d) => this.onMatchLeft(d.how)),
      b.on('deck_res_local', (d) => {
        this.localDeck = d;
        if (this.client?.result) this.pushEndData();
      }),
      b.on('stats_local', (d) => {
        this.localStats = d;
        if (this.client?.result) this.pushEndData();
      }),
    );
  }

  private currentClient(): MatchClient | null {
    return this.client ?? this.practice?.client ?? null;
  }

  private onLuaEvent(e: GameEvent): void {
    const c = this.currentClient();
    if (c) c.luaEvent(e);
  }

  private onSettings(d: L2JData<'ui_settings'>): void {
    const s = this.settings;
    let info = false;
    if (d.avatarJoker && d.avatarJoker !== s.avatarJoker) {
      s.avatarJoker = d.avatarJoker;
      info = true;
    }
    if (d.blindCol && d.blindCol !== s.blindCol) {
      s.blindCol = d.blindCol;
      info = true;
    }
    if (d.timerSound) s.timerSound = d.timerSound;
    if (d.nemesisLayout) s.nemesisLayout = d.nemesisLayout;
    if (d.showMpContent !== undefined) s.showMpContent = d.showMpContent;
    if (d.chat !== undefined) {
      s.chat = d.chat;
      this.chat.enabled = d.chat;
    }
    this.saveSettings();
    if (info && !this.client) this.role?.playerInfo();
  }

  private async onSnapshot(runId: string): Promise<void> {
    const c = this.client;
    const fs = this.deps.fs;
    const code = this.role?.code;
    if (!c || c.match.runId !== runId || !fs || !code || !this.deps.snapshots) return;
    try {
      const run = fs.readFile(BRIDGE_PATHS.MP_RUN);
      const state = fs.analyzePath(BRIDGE_PATHS.MP_STATE).exists ? fs.readFile(BRIDGE_PATHS.MP_STATE, { encoding: 'utf8' }) : '{}';
      await this.deps.snapshots.put({
        runId,
        code,
        savedAt: this.deps.sched.now(),
        run: typeof run === 'string' ? new TextEncoder().encode(run) : run,
        state: typeof state === 'string' ? state : new TextDecoder().decode(state),
      });
    } catch (err) {
      this.deps.log(`[mp] snapshot not saved: ${String(err)}`, true);
    }
  }

  private onMatchLeft(how: 'leave' | 'continue_sp' | 'return_lobby'): void {
    if (this.practice) {
      this.stopPractice();
      this.deps.bridge.send('history', recordResult(this.deps.kv, 'practice'));
      return;
    }
    switch (how) {
      case 'leave':
        this.dropRole();
        break;
      case 'continue_sp':
        // The match is over for us; the run continues alone. Give the seat up.
        this.dropRole();
        break;
      case 'return_lobby':
        this.role?.hostIntent({ t: 'return_lobby' });
        this.endMatch();
        break;
    }
  }

  private onSeat(op: 'rejoin' | 'abandon'): void {
    const held = this.held;
    this.held = null;
    if (op === 'abandon') {
      this.hubGate.emit('balatro:p2p:leave', {});
      const runId = held?.runId ?? rejoinHint(this.deps.kv);
      if (runId) void this.deps.snapshots?.delete(runId);
      setRejoinHint(this.deps.kv, null);
      return;
    }
    if (held) this.joinCode(held.code, 'player', held.runId ?? rejoinHint(this.deps.kv));
  }

  /* ─── Hub ─── */

  private bindHub(): void {
    const hub = this.deps.hub;
    this.offs.push(
      hub.onStatus((s, info) => {
        this.hubStatus = s;
        this.pushNetStatus(info.reason);
        if (s === 'connected') this.querySeat();
      }),
      hub.on('balatro:seat', (d) => {
        if (!d.code) {
          setRejoinHint(this.deps.kv, null);
          return;
        }
        if (this.role?.code === d.code) return;
        if (!d.started) {
          // LOB-18: back to the waiting room.
          this.joinCode(d.code, 'player');
          return;
        }
        this.held = { code: d.code, runId: d.runId };
        this.error('seat-held');
      }),
    );
  }

  /* ─── Page hooks ─── */

  join(code: string): void {
    void this.ready.then(() => !this.stopped && this.joinCode(code, 'player'));
  }

  /**
   * NET-09: the page's tab was hidden or shown. The role tells the peers (a display-only
   * "away" after 2 s; the link and the run keep going). On return Lua drains its backlog;
   * re-send what it shows.
   */
  setHidden(hidden: boolean): void {
    if (this.stopped) return;
    this.hidden = hidden;
    this.role?.setHidden(hidden);
    if (hidden) return;
    this.currentClient()?.refresh();
    const l = this.role?.lobby();
    if (l) this.ctx().view(l, this.role?.kind === 'host', null);
  }

  snapshot(): RuntimeSnapshot {
    const c = this.currentClient();
    return {
      me: this.me,
      role: this.practice
        ? 'practice'
        : this.role?.kind === 'member'
          ? ((this.role as LobbyMember).role === 'spectator' ? 'spectator' : 'member')
          : (this.role?.kind ?? null),
      code: this.role?.code ?? null,
      lobby: this.role?.lobby() ?? null,
      runId: c?.match.runId ?? null,
      hub: this.hubStatus,
      lastHs: c?.lastHs ?? -1,
      result: c?.result ?? null,
      target: c?.routing.target ?? null,
      lives: { ...(c?.routing.lives ?? {}) },
      checkpointSeq: this.checkpoint?.seq ?? null,
    };
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const r = this.role;
    this.role = null;
    r?.stop();
    this.client?.stop();
    this.client = null;
    this.stopPractice();
    for (const off of this.offs.splice(0)) off();
  }
}
