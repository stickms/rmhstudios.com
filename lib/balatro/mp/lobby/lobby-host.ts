/**
 * The lobby host: the authority for the lobby and the match (PLAN §0.1–0.3).
 *
 * - **Admission.** The hub vouches for every joiner (userId, name, avatar);
 *   the host admits players while the lobby is open, seated players back
 *   into a running match, and spectators; the joiner's first frame is `hello`,
 *   whose content hash and protocol must match ours (D-36) or it gets
 *   `bye {reason:'version-mismatch'}`.
 * - **Lobby state** (lobby-reducer.ts) is versioned and broadcast whole
 *   (`lobby`), mirrored to Lua (`lobby_view`) and summarised to the hub
 *   directory (`balatro:p2p:state`: open/started/members/successor).
 * - **Match.** `start` builds the StartedMatch (crypto seed, runId, loadouts),
 *   broadcasts `start_game`, runs WS4's referee (match-host.ts), routes its
 *   outcomes and checkpoints, relays peer traffic per §3.b with `f` stamped,
 *   keeps each player's current-ante hand results (the NET-07 tail) and an
 *   outcome log a returning member is caught up from (deduplicated by `hs`).
 * - **Presence** (NET-04): a member link silent for 5 s is away; a lost link
 *   or the hub's `member-away` too. Away players have `seatGraceMs` (120 s)
 *   to come back before their seat is forfeited (referee `grace_expired`, hub
 *   `forfeit-seat`); a crash-rejoiner has `CATCH_UP_LIMIT_MS` (3 min) to
 *   catch up (`player_info` after its restore marks it caught up).
 * - **Hidden tabs** (NET-09): a player whose tab has been hidden for
 *   `HIDDEN_AWAY_AFTER_MS` (a member's `visibility`, or the host's own tab) is
 *   announced `presence away` WITHOUT `graceMsLeft`, and `back` once shown. It
 *   is display only: the link is alive and the run keeps going, so no seat
 *   grace starts, the referee is not told, and members do not suspend their
 *   timers for it (they do for a graced away). It lives apart from the
 *   link-silence `away` map: a link-away on top of it shows the graced away,
 *   and when the link returns while the tab is still hidden the display-only
 *   away is shown again. The hidden player itself is never told about it.
 * - **Migration.** A promoted member builds its LobbyHost with `adopt`.
 * - **Reclaim** (MM-06). `create(…, {code, token})` asks the hub for a code
 *   this player hosted before (a party closed when it was matched), so the
 *   party can "Return to lobby XXXXXX". When the code is taken meanwhile the
 *   host falls back to a fresh code instead of failing.
 */

import { BALATRO_LIMITS } from '../../net/limits';
import type { BalatroS2CPayload } from '../../net/events';
import type { IceServerConfig } from '../../../shared/p2p/ice-core';
import type { Envelope, PeerKind, WireData } from '../wire';
import { isHostOnly, PEER_KINDS, resolveHubIce, WIRE_META, WIRE_PROTOCOL } from '../wire-codec';
import { maxPlayersFor } from '../rulesets/options';
import { sanitizeName, sanitizeText } from '../identity';
import { RefereeDriver } from '../match/match-host';
import { successorHs, takeoverCheckpoint } from '../migration';
import { HostStar, type StarMember } from '../transport/host-star';
import type { GameEvent, HandResult, Id, LobbyState, RefMsg, StartedMatch, Team } from '../types';
import {
  addPlayer,
  buildMatch,
  createLobby,
  kick,
  markForfeited,
  patchPlayer,
  player,
  removePlayer,
  reseedLobby,
  returnToLobby,
  seated,
  setDeck,
  setOption,
  setReady,
  setSetup,
  setTeam,
  startBlock,
  startLobby,
  withSuccessor,
} from './lobby-reducer';
import type { HostIntent, MatchMemory, Role, RoleCtx } from './context';

export const AWAY_AFTER_MS = 5_000;
export const PRESENCE_POLL_MS = 1_000;
/** NET-09: a tab hidden this long is announced away (alt-tabbing stays quiet). */
export const HIDDEN_AWAY_AFTER_MS = 2_000;
export const OUTCOME_LOG_MAX = 4_096;
export const TAIL_MAX = 256;
/** A deliberate host leave waits this long before the hub hands the room over. */
export const LEAVE_DRAIN_MS = 500;
/** A version jump for a successor's first lobby, so members accept it over the old host's. */
export const LOBBY_VERSION_GAP = 1_000;

const PEER_SET: ReadonlySet<string> = new Set(PEER_KINDS);

interface Away {
  since: number;
  cancel: () => void;
}

export interface SetupInput {
  from: Id;
  kind: 'vote' | 'draft';
  stepId: string;
  value: string;
}

export class LobbyHost implements Role {
  readonly kind = 'host' as const;
  code: string | null = null;
  private token: string | null = null;
  private ice: IceServerConfig[] = [];
  private state: LobbyState | null = null;
  private star: HostStar | null = null;
  driver: RefereeDriver | null = null;
  private readonly offs: (() => void)[] = [];
  private readonly away = new Map<Id, Away>();
  private readonly catchUp = new Map<Id, () => void>();
  /** NET-09: hidden tabs waiting out the debounce (cancel), and the ones announced away. */
  private readonly hiddenPending = new Map<Id, () => void>();
  private readonly hiddenShown = new Set<Id>();
  private readonly tails = new Map<Id, { ante: number; results: HandResult[] }>();
  private outLog: { to: '*' | Id; msg: RefMsg; hs: number }[] = [];
  /** Members (userIds) that said hello on the current link. */
  private readonly greeted = new Set<string>();
  private stopPoll: (() => void) | null = null;
  private migratedFrom: Id | null = null;
  private stopped = false;
  private hubKey = '';
  /** The hub has confirmed this room at least once (`hosted`). */
  private confirmed = false;
  /** Reclaiming a former code that the hub has not confirmed yet. */
  private reclaiming = false;
  /** WS12's casual-lobby setup driver hooks in here (votes and draft). */
  onSetupInput: ((i: SetupInput) => void) | null = null;

  constructor(private readonly ctx: RoleCtx) {
    const hub = ctx.deps.hub;
    this.offs.push(
      hub.on('balatro:p2p:hosted', (d) => this.onHosted(d)),
      hub.on('balatro:p2p:promote', (d) => this.onHostedAgain(d.code, d.token, d.ice)),
      hub.on('balatro:p2p:join-request', (d) => this.onJoinRequest(d)),
      hub.on('balatro:p2p:member-left', (d) => this.onMemberLeft(d)),
      hub.on('balatro:p2p:member-away', (d) => {
        const m = this.star?.members.get(d.peerId);
        if (m && d.away && !m.link.isOpen) this.markAway(m.userId);
      }),
      hub.on('balatro:p2p:host-changed', (d) => {
        if (d.hostUserId !== ctx.me && d.code === this.code) ctx.demoted(d.code);
      }),
      hub.on('balatro:p2p:closed', (d) => {
        if (d.code === this.code) this.end('closed');
      }),
      hub.on('balatro:p2p:error', (d) => {
        if (d.event === 'balatro:p2p:host') {
          if (this.reclaiming && !this.confirmed && d.code === 'not-host') {
            // Someone holds the old code now: open the party under a fresh one.
            this.reclaiming = false;
            this.code = null;
            this.token = null;
            ctx.deps.log('[mp host] reclaim refused; hosting under a new code');
            this.claim(false);
            return;
          }
          ctx.error(d.code);
          if (!this.confirmed) this.end(d.code);
        }
      }),
      hub.onStatus((s, info) => {
        // A hub blip: re-claim the room (resume), or re-create it after a hub restart (NET-12).
        if (s === 'connected' && info.reconnect && this.code && this.token && this.state) this.claim(true);
      }),
    );
    this.stopPoll = ctx.deps.sched.every(PRESENCE_POLL_MS, () => this.pollPresence());
  }

  /* ─── Creating / adopting ─── */

  create(queueMode: LobbyState['queueMode'], kind: LobbyState['kind'], reclaim?: { code: string; token: string }): void {
    const now = this.ctx.deps.sched.now();
    this.state = createLobby({
      code: reclaim?.code ?? 'AAAAAA',
      kind,
      queueMode,
      host: this.hostSeed(now),
    });
    if (reclaim) {
      this.code = reclaim.code;
      this.token = reclaim.token;
      this.reclaiming = true;
    }
    this.claim(!!reclaim);
  }

  /** The hub's resume token for this room (null until hosted); a party remembers it for MM-06. */
  get hostToken(): string | null {
    return this.token;
  }

  /** A promoted member takes over (§0.3): the lobby it held, the match, the newest checkpoint. */
  adopt(p: { code: string; token: string; ice: unknown }, lobby: LobbyState, mem: MatchMemory | null, previousHost: Id): void {
    this.migratedFrom = previousHost;
    this.confirmed = true;
    this.code = p.code;
    this.token = p.token;
    this.ice = resolveHubIce(p.ice);
    let s: LobbyState = {
      ...lobby,
      hostId: this.ctx.me,
      version: lobby.version + LOBBY_VERSION_GAP,
      players: lobby.players
        .filter((pl) => pl.id !== previousHost || !!lobby.started)
        .map((pl) =>
          pl.id === this.ctx.me
            ? { ...pl, connected: true, away: false, ready: false }
            : { ...pl, connected: false, away: true },
        ),
    };
    this.state = s;
    this.startStar();
    if (mem && lobby.started && mem.match.runId === lobby.started.runId) {
      const match = mem.match;
      this.newDriver(match, successorHs(mem.lastHs));
      const lives = mem.checkpoint ? {} : (this.ctx.client()?.routing.lives ?? {});
      const { checkpoint, rebuilt } = takeoverCheckpoint(
        match,
        mem.checkpoint,
        { lives, pairing: this.ctx.client()?.routing.pairing ?? null },
        this.ctx.deps.sched.now(),
        this.ctx.deps.randomInt(),
      );
      if (rebuilt) this.ctx.deps.log('[mp] takeover without a checkpoint: rebuilt from the local cache', true);
      this.driver?.restore(checkpoint, [this.ctx.me]);
      // Everyone else is away until they reconnect: their seat grace starts now.
      for (const r of match.roster) if (r.id !== this.ctx.me && !lobby.forfeited[r.id]) this.markAway(r.id, true);
    } else {
      for (const pl of s.players) if (pl.id !== this.ctx.me) this.markAway(pl.id, true);
    }
    s = this.state;
    this.commit({ ...s, version: s.version + 1 });
    this.ctx.deps.bridge.send('host_changed', { hostId: this.ctx.me });
  }

  private hostSeed(now: number) {
    return {
      id: this.ctx.me,
      name: sanitizeName(this.ctx.name, this.ctx.glyphs()),
      avatarUrl: this.ctx.avatarUrl,
      avatarJoker: this.ctx.settings.avatarJoker,
      blindCol: this.ctx.settings.blindCol,
      role: 'player' as const,
      joinedAt: now,
    };
  }

  private claim(resume: boolean): void {
    if (!this.state) return;
    const s = this.state;
    this.ctx.deps.hub.emit('balatro:p2p:host', {
      kind: s.kind,
      queueMode: s.queueMode,
      maxPlayers: maxPlayersFor(s.queueMode, s.kind),
      contentHash: this.ctx.deps.contentHash,
      spectatable: true,
      ...(resume && this.code && this.token ? { resume: { code: this.code, token: this.token } } : {}),
    });
  }

  private onHosted(d: BalatroS2CPayload<'balatro:p2p:hosted'>): void {
    this.onHostedAgain(d.code, d.token, d.ice);
  }

  private onHostedAgain(code: string, token: string, ice: unknown): void {
    if (this.stopped || !this.state) return;
    // A reclaimed code is already ours locally: the first `hosted` still publishes the lobby.
    const first = !this.confirmed;
    this.confirmed = true;
    this.reclaiming = false;
    this.token = token;
    this.ice = resolveHubIce(ice);
    if (this.code !== code || first) {
      this.code = code;
      this.commit({ ...this.state, code, version: this.state.version + 1 });
    }
    this.startStar();
    this.hubKey = '';
    this.pushHubState();
  }

  private startStar(): void {
    if (this.star) return;
    this.star = new HostStar({
      hub: this.ctx.deps.hub,
      connector: this.ctx.deps.connector,
      sched: this.ctx.deps.sched,
      ice: () => this.ice,
      onEnvelope: (m, env) => this.onEnvelope(m, env),
      onOpen: () => undefined,
      onClose: (m) => {
        this.greeted.delete(m.peerId);
        this.markAway(m.userId);
      },
      log: (msg) => this.ctx.deps.log(`[mp host] ${msg}`),
    });
  }

  /* ─── Lobby state ─── */

  lobby(): LobbyState | null {
    return this.state;
  }

  private commit(next: LobbyState): void {
    if (next === this.state) return;
    const withSucc = withSuccessor(next);
    this.state = withSucc;
    this.star?.broadcast('lobby', { version: withSucc.version, state: withSucc });
    const block = startBlock(withSucc);
    this.ctx.view(withSucc, true, block);
    this.pushHubState();
  }

  private pushHubState(): void {
    const s = this.state;
    if (!s || !this.code || !this.confirmed) return;
    const succ = s.successorId ? (this.star?.byUser(s.successorId)?.peerId ?? null) : null;
    const payload = {
      open: s.open,
      started: !!s.started,
      runId: s.started?.runId ?? null,
      members: seated(s)
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => p.id)
        .slice(0, 24),
      successor: succ,
      spectatable: true,
      summary: { players: seated(s).length, ante: this.driver?.ante() ?? null },
    };
    const key = JSON.stringify(payload);
    if (key === this.hubKey) return;
    this.hubKey = key;
    this.ctx.deps.hub.emit('balatro:p2p:state', payload);
  }

  /* ─── Admission ─── */

  private onJoinRequest(d: BalatroS2CPayload<'balatro:p2p:join-request'>): void {
    if (!this.star || !this.state || this.stopped) return;
    const s = this.state;
    if (s.kicked.includes(d.userId)) return this.star.refuse(d.peerId, 'host-refused');
    if (d.role === 'player') {
      const inMatch = s.started?.roster.some((r) => r.id === d.userId) ?? false;
      if (s.started && (!inMatch || s.forfeited[d.userId] === s.started.runId)) return this.star.refuse(d.peerId, 'started');
      const known = player(s, d.userId);
      if (!s.started && !known && seated(s).length >= maxPlayersFor(s.queueMode, s.kind)) return this.star.refuse(d.peerId, 'full');
      if (!s.started && !known && !s.open) return this.star.refuse(d.peerId, 'full');
    }
    // A newer connection from the same account replaces the old one.
    for (const m of [...this.star.members.values()]) if (m.userId === d.userId) this.star.drop(m.peerId, 'replaced');
    this.star.admit({ ...d, name: sanitizeName(d.name, this.ctx.glyphs()) });
  }

  private onMemberLeft(d: BalatroS2CPayload<'balatro:p2p:member-left'>): void {
    const m = this.star?.members.get(d.peerId);
    if (d.reason === 'kicked') return;
    if (d.reason === 'left') this.left(d.userId);
    else if (m) {
      this.star?.drop(m.peerId, 'hub-disconnected');
      if (!this.greeted.has(m.peerId)) return;
      this.markAway(d.userId);
    }
  }

  /* ─── Envelopes from members ─── */

  private onEnvelope(m: StarMember, env: Envelope): void {
    if (this.stopped) return;
    // Members never speak for the host, and never for someone else (`f` ignored).
    if (isHostOnly(env.k)) return;
    const from = m.userId;
    if (env.k !== 'hello' && !this.greeted.has(m.peerId)) return;
    if (this.away.has(from) && m.link.isOpen) this.back(from);
    switch (env.k) {
      case 'hello':
        return this.onHello(m, env.d as WireData<'hello'>);
      case 'player_info': {
        const d = env.d as WireData<'player_info'>;
        if (!this.state) return;
        this.commit(patchPlayer(this.state, from, { avatarJoker: d.avatarJoker, blindCol: d.blindCol }));
        if (this.catchUp.has(from)) this.caughtUpFor(from);
        return;
      }
      case 'ready':
        if (this.state) this.commit(setReady(this.state, from, (env.d as WireData<'ready'>).ready));
        return;
      case 'set_team':
        if (this.state) this.commit(setTeam(this.state, from, (env.d as WireData<'set_team'>).team));
        return;
      case 'leave':
      case 'bye':
        return this.left(from);
      case 'vote_cast': {
        const d = env.d as WireData<'vote_cast'>;
        this.onSetupInput?.({ from, kind: 'vote', stepId: d.stepId, value: d.option });
        return;
      }
      case 'draft_choose': {
        const d = env.d as WireData<'draft_choose'>;
        this.onSetupInput?.({ from, kind: 'draft', stepId: d.stepId, value: d.key });
        return;
      }
      case 'game':
        if (m.role !== 'player') return;
        return this.gameEvent(from, (env.d as WireData<'game'>).e);
      case 'chat':
        if (m.role !== 'player' && m.role !== 'spectator') return;
        return this.relayChat(from, (env.d as WireData<'chat'>).text);
      case 'visibility':
        if (m.role !== 'player') return;
        return this.onVisibility(from, (env.d as WireData<'visibility'>).hidden);
      case 'log':
        if (m.role !== 'player') return;
        this.star?.broadcast('log', env.d as WireData<'log'>, { f: from }, m.peerId);
        this.ctx.replayTap()?.peerLog(from, env.d as WireData<'log'>);
        return;
      default:
        if (PEER_SET.has(env.k) && m.role === 'player') this.relayPeer(m, env.k as PeerKind, env.d as never, env.to);
    }
  }

  private onHello(m: StarMember, d: WireData<'hello'>): void {
    if (!this.star || !this.state) return;
    if (d.contentHash !== this.ctx.deps.contentHash || d.protocol !== WIRE_PROTOCOL) {
      this.star.send(m.peerId, 'bye', { reason: 'version-mismatch' });
      this.ctx.deps.sched.after(200, () => this.star?.drop(m.peerId, 'version-mismatch'));
      return;
    }
    this.greeted.add(m.peerId);
    const now = this.ctx.deps.sched.now();
    const s0 = this.state;
    const known = player(s0, m.userId);
    let s = addPlayer(s0, {
      id: m.userId,
      name: m.name,
      avatarUrl: m.avatarUrl,
      avatarJoker: d.info.avatarJoker,
      blindCol: d.info.blindCol,
      role: known?.role ?? m.role,
      joinedAt: known?.joinedAt ?? now,
      conn: this.star.connKind(m),
    });
    s = patchPlayer(s, m.userId, { avatarJoker: d.info.avatarJoker, blindCol: d.info.blindCol });
    const match = s.started;
    const inMatch = !!match && match.roster.some((r) => r.id === m.userId);
    const fresh = inMatch && d.rejoin !== null && d.rejoin.runId === match?.runId;
    if (fresh) s = patchPlayer(s, m.userId, { catchingUp: true });
    this.cancelAway(m.userId);
    this.commit(s);

    const cp = this.driver?.latest ?? null;
    const tail: Record<Id, HandResult[]> = {};
    for (const [id, t] of this.tails) if (id !== m.userId && t.results.length) tail[id] = t.results.slice(-TAIL_MAX);
    this.star.send(m.peerId, 'welcome', {
      you: m.userId,
      lobby: this.state as LobbyState,
      match: match ?? null,
      checkpoint: match && cp?.runId === match.runId ? cp : null,
      lives: this.driver?.lives() ?? {},
      tail,
    });
    if (this.migratedFrom) this.star.send(m.peerId, 'host_changed', { hostId: this.ctx.me, from: 'migration' });
    // NET-09: the hidden tabs already announced (a presence is not part of the welcome).
    for (const id of this.hiddenShown) {
      if (id !== m.userId && !this.away.has(id)) this.star.send(m.peerId, 'presence', { id, status: 'away' });
    }
    if (match && m.role === 'spectator') {
      // REP-04: a spectator joining a running match gets every replay log so far (WS13).
      const peer = m.peerId;
      this.ctx.replayTap()?.catchUp(match.runId, (f, d) => !!this.star?.send(peer, 'log', d, { f }));
    }
    if (!match || !inMatch || !this.driver) return;
    if (fresh) {
      // A crash rejoin: the referee resyncs this player (REF-20); it has 3 minutes to catch up.
      this.presence(m.userId, 'catching_up');
      this.driver.presence(m.userId, 'rejoined');
      this.armCatchUp(m.userId);
    } else {
      // Back with its run still live (a network drop, or a host migration): what it missed.
      for (const e of this.outLog) {
        if (e.to === '*' || e.to === m.userId) this.star.send(m.peerId, 'outcome', { o: e.msg, hs: e.hs });
      }
      this.driver.presence(m.userId, 'back');
    }
  }

  /* ─── Presence ─── */

  private pollPresence(): void {
    if (!this.star) return;
    for (const m of this.star.members.values()) {
      if (!this.greeted.has(m.peerId) || m.role !== 'player') continue;
      const silent = m.link.silentForMs();
      if (silent > AWAY_AFTER_MS) this.markAway(m.userId);
      else if (m.link.isOpen && this.away.has(m.userId)) this.back(m.userId);
    }
    this.pushHubState();
  }

  private grace(): number {
    return this.state?.options.seatGraceMs ?? BALATRO_LIMITS.SEAT_GRACE_MS;
  }

  private markAway(id: Id, quiet = false): void {
    if (!this.state || id === this.ctx.me || this.away.has(id)) return;
    const p = player(this.state, id);
    if (!p) return;
    const started = this.state.started;
    if (started && this.state.forfeited[id] === started.runId) return;
    const grace = started ? this.grace() : Math.min(this.grace(), 30_000);
    const cancel = this.ctx.deps.sched.after(grace, () => this.graceExpired(id));
    this.away.set(id, { since: this.ctx.deps.sched.now(), cancel });
    const link = this.star?.byUser(id)?.link;
    this.commit(patchPlayer(this.state, id, { away: true, connected: !!link?.isOpen }));
    if (!quiet) this.presence(id, 'away', grace);
    this.driver?.presence(id, 'away');
  }

  private cancelAway(id: Id): boolean {
    const a = this.away.get(id);
    if (!a) return false;
    a.cancel();
    this.away.delete(id);
    return true;
  }

  private back(id: Id): void {
    if (!this.cancelAway(id) || !this.state) return;
    this.commit(patchPlayer(this.state, id, { away: false, connected: true }));
    this.presence(id, 'back');
    this.driver?.presence(id, 'back');
    // The link is back but the tab is still hidden: the display-only away again (NET-09).
    if (this.hiddenShown.has(id)) this.hiddenPresence(id, 'away');
  }

  /* ─── Hidden tabs (NET-09) ─── */

  /** A player's tab was hidden or shown: a member's `visibility`, or the host's own (setHidden). */
  private onVisibility(id: Id, hidden: boolean): void {
    if (this.stopped || !this.state) return;
    if (!hidden) return this.clearHidden(id, true);
    if (this.hiddenPending.has(id) || this.hiddenShown.has(id)) return;
    const cancel = this.ctx.deps.sched.after(HIDDEN_AWAY_AFTER_MS, () => {
      this.hiddenPending.delete(id);
      this.showHidden(id);
    });
    this.hiddenPending.set(id, cancel);
  }

  private showHidden(id: Id): void {
    const s = this.state;
    if (this.stopped || !s || !player(s, id)) return;
    if (s.started && s.forfeited[id] === s.started.runId) return;
    this.hiddenShown.add(id);
    // A link-away already shows (with its grace); back() re-shows this one when the link returns.
    if (!this.away.has(id)) this.hiddenPresence(id, 'away');
  }

  /** Forget a hidden tab; `announce` tells everyone it is back (unless a link-away still shows). */
  private clearHidden(id: Id, announce: boolean): void {
    this.hiddenPending.get(id)?.();
    this.hiddenPending.delete(id);
    if (this.hiddenShown.delete(id) && announce && !this.away.has(id)) this.hiddenPresence(id, 'back');
  }

  /** A display-only presence: never a grace, never to the hidden player itself. */
  private hiddenPresence(id: Id, status: 'away' | 'back'): void {
    const d: WireData<'presence'> = { id, status };
    this.star?.broadcast('presence', d, undefined, this.star.byUser(id)?.peerId);
    if (id !== this.ctx.me) this.ctx.deps.bridge.send('presence', d);
  }

  /** The host's own tab (MpRuntime.setHidden). */
  setHidden(hidden: boolean): void {
    if (this.ctx.me) this.onVisibility(this.ctx.me, hidden);
  }

  private graceExpired(id: Id): void {
    this.away.delete(id);
    this.clearHidden(id, false);
    if (!this.state) return;
    const started = this.state.started;
    if (!started || this.driver?.over) {
      this.commit(removePlayer(this.state, id));
      return;
    }
    this.forfeitSeat(id, 'grace_expired');
  }

  private forfeitSeat(id: Id, why: 'grace_expired' | 'catchup_expired' | 'left'): void {
    const s = this.state;
    if (!s?.started) return;
    const runId = s.started.runId;
    this.clearHidden(id, false);
    this.driver?.presence(id, why);
    this.commit(patchPlayer(markForfeited(s, id, runId), id, { connected: false, catchingUp: false }));
    this.ctx.deps.hub.emit('balatro:p2p:forfeit-seat', { userId: id, runId });
    this.presence(id, why === 'left' ? 'left' : 'forfeited');
    const m = this.star?.byUser(id);
    if (m) this.star?.drop(m.peerId, why);
  }

  private presence(id: Id, status: WireData<'presence'>['status'], graceMsLeft?: number): void {
    const d: WireData<'presence'> = graceMsLeft === undefined ? { id, status } : { id, status, graceMsLeft };
    this.star?.broadcast('presence', d);
    this.ctx.deps.bridge.send('presence', d);
  }

  private armCatchUp(id: Id): void {
    this.catchUp.get(id)?.();
    const cancel = this.ctx.deps.sched.after(BALATRO_LIMITS.CATCH_UP_LIMIT_MS, () => {
      this.catchUp.delete(id);
      this.forfeitSeat(id, 'catchup_expired');
    });
    this.catchUp.set(id, cancel);
  }

  private caughtUpFor(id: Id): void {
    this.catchUp.get(id)?.();
    this.catchUp.delete(id);
    if (this.state) this.commit(patchPlayer(this.state, id, { catchingUp: false }));
    this.presence(id, 'caught_up');
  }

  /** A deliberate leave (wire `leave`/`bye`, hub `member-left: left`). */
  private left(id: Id): void {
    if (!this.state) return;
    this.cancelAway(id);
    this.clearHidden(id, false);
    const m = this.star?.byUser(id);
    if (this.state.started && !this.driver?.over && this.state.started.roster.some((r) => r.id === id)) {
      this.forfeitSeat(id, 'left');
      return;
    }
    if (m) this.star?.drop(m.peerId, 'left');
    this.commit(removePlayer(this.state, id));
  }

  /* ─── The match ─── */

  private newDriver(match: StartedMatch, firstHs: number): void {
    this.driver?.stop();
    this.outLog = [];
    this.tails.clear();
    this.driver = new RefereeDriver({
      sched: this.ctx.deps.sched,
      match,
      firstHs,
      emit: (to, msg, hs) => this.deliverOutcome(to, msg, hs),
      checkpoint: (cp) => {
        this.ctx.holdCheckpoint(cp);
        if (this.state) this.star?.broadcast('checkpoint', { runId: cp.runId, version: cp.seq, blob: cp, lobby: this.state });
        this.pushHubState();
      },
      onReseed: (seed) => {
        if (this.state) this.commit(reseedLobby(this.state, seed));
        this.tails.clear();
      },
      log: (msg) => this.ctx.deps.log(`[mp referee] ${msg}`, true),
    });
  }

  private deliverOutcome(to: '*' | Id, msg: RefMsg, hs: number): void {
    this.outLog.push({ to, msg, hs });
    if (this.outLog.length > OUTCOME_LOG_MAX) this.outLog.splice(0, this.outLog.length - OUTCOME_LOG_MAX);
    if (to === '*') this.star?.broadcast('outcome', { o: msg, hs });
    else if (to !== this.ctx.me) {
      const m = this.star?.byUser(to);
      if (m) this.star?.send(m.peerId, 'outcome', { o: msg, hs });
    }
    if (to === '*' || to === this.ctx.me) this.ctx.client()?.outcome(msg, hs);
  }

  private gameEvent(from: Id, e: GameEvent): void {
    if (!this.driver) return;
    if (e.t === 'set_ante') this.tails.set(from, { ante: e.ante, results: [] });
    if (e.t === 'play_hand' || e.t === 'skip') {
      const t = this.tails.get(from) ?? { ante: 0, results: [] };
      const r: HandResult = {
        ante: t.ante,
        score: e.score,
        hands_left: e.hands_left,
        skips: e.skips,
        at: Math.max(0, this.ctx.deps.sched.now() - this.driver.match.startedAt),
      };
      if (e.lives !== undefined) r.lives = e.lives;
      t.results.push(r);
      if (t.results.length > TAIL_MAX) t.results.shift();
      this.tails.set(from, t);
    }
    this.driver.event(from, e);
  }

  private start(): void {
    const s = this.state;
    if (!s || !this.star) return;
    const block = startBlock(s);
    if (block) {
      this.ctx.error(`start-${block}`);
      return;
    }
    const d = this.ctx.deps;
    const match = buildMatch(s, {
      runId: d.randomId(),
      seed: d.randomSeed(),
      rngSeed: d.randomInt(),
      now: d.sched.now(),
      contentHash: d.contentHash,
    });
    this.commit(startLobby(s, match));
    this.star.broadcast('start_game', match);
    this.ctx.beginMatch(match, 'start');
    this.newDriver(match, Math.max(0, this.ctx.client()?.lastHs ?? 0) + 1);
    this.driver?.reset(d.randomInt());
  }

  /* ─── Peer traffic ─── */

  private relayPeer<K extends PeerKind>(m: StarMember, kind: K, d: WireData<K>, to: string | undefined): void {
    const from = m.userId;
    const all = WIRE_META[kind].dir === 'P>H>A' || to === undefined || to === '*';
    if (all) {
      this.star?.broadcast(kind, d, { f: from }, m.peerId);
      this.ctx.client()?.peerIn(kind, from, d);
      return;
    }
    if (to === this.ctx.me) {
      this.ctx.client()?.peerIn(kind, from, d);
      return;
    }
    if (to === from) return;
    const target = this.star?.byUser(to);
    if (target) this.star?.send(target.peerId, kind, d, { f: from, to });
  }

  private relayChat(from: Id, text: string): void {
    const chat = this.ctx.chat;
    if (!chat.allowRelay(from)) return;
    const clean = sanitizeText(text, 'all', 500);
    if (!clean) return;
    const sender = this.star?.byUser(from);
    this.star?.broadcast('chat', { text: clean }, { f: from }, sender?.peerId);
    const name = (this.state && player(this.state, from)?.name) ?? 'Player';
    const line = chat.receive(from, name, clean, false, this.ctx.me);
    if (line) this.ctx.deps.bridge.send('chat_line', line);
  }

  /** A system line from the host (vote results, joins). */
  system(text: string): void {
    this.star?.broadcast('chat', { text, system: true });
    const line = this.ctx.chat.receive(this.ctx.me, 'System', text, true, this.ctx.me);
    if (line) this.ctx.deps.bridge.send('chat_line', line);
  }

  /* ─── Role API (the host's own Lua and MatchClient) ─── */

  sendGame(e: GameEvent): void {
    this.gameEvent(this.ctx.me, e);
  }

  sendPeer<K extends PeerKind>(kind: K, d: WireData<K>, to: '*' | Id): void {
    if (to === '*') {
      this.star?.broadcast(kind, d);
      return;
    }
    const m = this.star?.byUser(to);
    if (m) this.star?.send(m.peerId, kind, d, { to });
  }

  chat(text: string): void {
    const chat = this.ctx.chat;
    const clean = chat.prepareOwn(text);
    if (!clean) return;
    this.star?.broadcast('chat', { text: clean });
    const name = (this.state && player(this.state, this.ctx.me)?.name) ?? this.ctx.name;
    this.ctx.deps.bridge.send('chat_line', chat.ownLine(this.ctx.me, name, clean));
  }

  ready(): void {
    /* the host is always ready (LOB-05) */
  }

  setTeam(team: Team): void {
    if (this.state) this.commit(setTeam(this.state, this.ctx.me, team));
  }

  playerInfo(): void {
    if (!this.state) return;
    this.commit(
      patchPlayer(this.state, this.ctx.me, {
        avatarJoker: this.ctx.settings.avatarJoker,
        blindCol: this.ctx.settings.blindCol,
      }),
    );
  }

  vote(stepId: string, option: string): void {
    this.onSetupInput?.({ from: this.ctx.me, kind: 'vote', stepId, value: option });
  }

  draft(stepId: string, key: string): void {
    this.onSetupInput?.({ from: this.ctx.me, kind: 'draft', stepId, value: key });
  }

  /** WS12's setup driver publishes its view through the lobby (`setup` + lobby state). */
  publishSetup(view: LobbyState['setup']): void {
    if (!this.state) return;
    this.commit(setSetup(this.state, view));
    if (view) {
      this.star?.broadcast('setup', { step: view });
      this.ctx.deps.bridge.send('setup_view', view);
    }
  }

  hostIntent(i: HostIntent): void {
    const s = this.state;
    if (!s) return;
    switch (i.t) {
      case 'set_option':
        this.commit(setOption(s, i.key as never, i.value, { testBuild: this.ctx.deps.testBuild }));
        return;
      case 'set_deck':
        this.commit(setDeck(s, i));
        return;
      case 'start':
        return this.start();
      case 'kick': {
        if (i.userId === this.ctx.me) return;
        const m = this.star?.byUser(i.userId);
        if (m) {
          this.ctx.deps.hub.emit('balatro:p2p:kick', { peerId: m.peerId });
          this.star?.send(m.peerId, 'bye', { reason: 'kicked' });
          this.star?.drop(m.peerId, 'kicked');
        }
        this.cancelAway(i.userId);
        this.clearHidden(i.userId, false);
        if (s.started && !this.driver?.over && s.started.roster.some((r) => r.id === i.userId)) {
          this.driver?.presence(i.userId, 'left');
        }
        this.commit(kick(this.state as LobbyState, i.userId));
        return;
      }
      case 'return_lobby':
        if (s.kind !== 'private' || !s.started || (this.driver && !this.driver.over)) return;
        this.driver?.stop();
        this.driver = null;
        this.commit(returnToLobby(s));
        return;
    }
  }

  caughtUp(): void {
    /* the host never catches up: it is the authority */
  }

  /** The host leaves (or forfeits): hand the room over at once (the hub promotes the successor). */
  leave(): void {
    if (this.stopped) return;
    const s = this.state;
    if (s?.started && this.driver && !this.driver.over) {
      // Forfeit first, so the successor's checkpoint already has it (REF-15).
      this.driver.event(this.ctx.me, { t: 'forfeit' });
      this.driver.flush();
    }
    this.star?.broadcast('bye', { reason: 'host-left' });
    // The forfeit, its checkpoint and the bye go out over P2P before the hub promotes the
    // successor (a member drops the old host's link the moment it hears `host-changed`).
    const star = this.star;
    this.star = null;
    const hub = this.ctx.deps.hub;
    this.ctx.deps.sched.after(LEAVE_DRAIN_MS, () => {
      hub.emit('balatro:p2p:leave', {});
      star?.stop();
    });
    this.end('left');
  }

  private end(why: string): void {
    if (this.stopped) return;
    this.stop();
    this.ctx.roleEnded(why);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.driver?.stop();
    this.stopPoll?.();
    for (const a of this.away.values()) a.cancel();
    this.away.clear();
    for (const c of this.catchUp.values()) c();
    this.catchUp.clear();
    for (const c of this.hiddenPending.values()) c();
    this.hiddenPending.clear();
    this.hiddenShown.clear();
    for (const off of this.offs.splice(0)) off();
    this.star?.stop();
    this.star = null;
  }
}
