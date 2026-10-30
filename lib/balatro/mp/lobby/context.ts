/**
 * What the lobby roles (lobby-host.ts, lobby-member.ts) share with the
 * session runtime (runtime.ts): the seams, the player's identity and
 * settings, chat, and the match that outlives a role change (a member
 * promoted to host keeps its MatchClient, its Lua run and its timers).
 */

import type { Chat } from '../chat';
import type { KeyValue } from '../history';
import type { MatchClient } from '../match/match-member';
import type { SnapshotStore } from '../rejoin/rejoin-store';
import type { ReplayTap } from '../replay/tap';
import type { GameEvent, Id, LobbyState, RefCheckpoint, StartedMatch } from '../types';
import type { PeerKind, WireData } from '../wire';
import type { BridgeLike, FsLike, HubLike, PeerConnector, Scheduler } from '../transport/types';

export interface MpSettings {
  avatarJoker: string;
  blindCol: number;
  timerSound: 'always' | 'once' | 'off';
  chat: boolean;
  nemesisLayout: 'standard' | 'mirrored' | 'classic';
  showMpContent: boolean;
  muted: string[];
}

export const DEFAULT_SETTINGS: MpSettings = {
  avatarJoker: 'j_joker',
  blindCol: 1,
  timerSound: 'always',
  chat: true,
  nemesisLayout: 'standard',
  showMpContent: false,
  muted: [],
};

export interface RuntimeDeps {
  bridge: BridgeLike;
  hub: HubLike;
  connector: PeerConnector;
  sched: Scheduler;
  fs: FsLike | null;
  kv: KeyValue | null;
  snapshots: SnapshotStore | null;
  /** D-36: `<core sha12><mp sha12>-v<protocol>`. */
  contentHash: string;
  /** VITE_BALATRO_MP_TEST=1 (accepts the test-only `seatGraceMs`). */
  testBuild: boolean;
  /** CSPRNG hooks (tests inject deterministic ones). */
  randomId(): string;
  randomSeed(): string;
  randomInt(): number;
  log(msg: string, isError?: boolean): void;
  /**
   * The ids this account blocked on the site (GET /api/moderation/block). Chat
   * starts with them muted; optional (tests, signed out). /api/pulse carries no
   * block list, so this is its own request, made once per session.
   */
  blockedIds?(): Promise<readonly string[]>;
}

/** Everything a fresh boot or a promotion carries into a role. */
export interface MatchMemory {
  match: StartedMatch;
  checkpoint: RefCheckpoint | null;
  lastHs: number;
}

export interface RoleCtx {
  deps: RuntimeDeps;
  me: Id;
  name: string;
  avatarUrl: string | null;
  settings: MpSettings;
  chat: Chat;
  glyphs(): Uint8Array | null;
  /** The player's language key (player_info). */
  lang: string;
  /** Lua's lobby screen. */
  view(state: LobbyState, isHost: boolean, block?: string | null): void;
  error(code: string): void;
  /** The running match on this peer (null outside one). */
  client(): MatchClient | null;
  /** Start (or adopt, for a rejoin/migration) the local match; `fresh` = boot the Lua run. */
  beginMatch(match: StartedMatch, how: 'start' | 'rejoin' | 'live'): void;
  /** The newest checkpoint held for the running match. */
  heldCheckpoint(): RefCheckpoint | null;
  holdCheckpoint(cp: RefCheckpoint): void;
  /** The role ended (left, kicked, closed). */
  roleEnded(why: string): void;
  /** This member was promoted (hub `promote`). */
  promoted(p: { code: string; token: string; ice: unknown }, lobby: LobbyState): void;
  /** This host was replaced (hub `host-changed` naming someone else). */
  demoted(code: string): void;
  /** WS13's replay/spectate seam (replay/attach.ts), or null when it is not loaded. */
  replayTap(): ReplayTap | null;
}

/** What a role offers the runtime (the MatchClient calls through these). */
export interface Role {
  readonly kind: 'host' | 'member';
  readonly code: string | null;
  lobby(): LobbyState | null;
  sendGame(e: GameEvent): void;
  sendPeer<K extends PeerKind>(kind: K, d: WireData<K>, to: '*' | Id): void;
  chat(text: string): void;
  ready(on: boolean): void;
  setTeam(team: NonNullable<LobbyState['players'][number]['team']>): void;
  playerInfo(): void;
  vote(stepId: string, option: string): void;
  draft(stepId: string, key: string): void;
  /** Lua's lobby intents only the host may act on; members ignore them. */
  hostIntent(i: HostIntent): void;
  /** Lua says the run is live again (first flags after a rejoin restore). */
  caughtUp(): void;
  /** NET-09: this tab was hidden or shown (the peers see a display-only "away"). */
  setHidden(hidden: boolean): void;
  leave(): void;
  stop(): void;
}

export type HostIntent =
  | { t: 'set_option'; key: string; value: unknown }
  | { t: 'set_deck'; deck: string; stake: number; mpStake: LobbyState['mpStake']; challenge: string | null }
  | { t: 'start' }
  | { t: 'kick'; userId: Id }
  | { t: 'return_lobby' };
