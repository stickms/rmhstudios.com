/**
 * Balatro multiplayer — WS12's extension of the session runtime: casual
 * matchmaking, party queueing, invites (MM-01…06, LOB-04, PR-05).
 *
 * index.ts loads this module through `import.meta.glob('./queue/attach.ts')`
 * and calls `attach(runtime)`; the returned function detaches it when the
 * session stops. It:
 *
 *   - handles Lua's `ui_queue` (FIND GAME / CANCEL, solo) and
 *     `ui_party_queue` (the party host's FIND GAME) and mirrors the hub's
 *     queue status to Lua as `queue_view`;
 *   - on `matched`: the elected host opens the casual lobby
 *     (`runtime.createLobby(mode, 'casual')`) and runs it with `CasualHost`
 *     (votes, draft, auto-start); a member joins the code the hub hands it
 *     (`runtime.joinCode`) and auto-readies. A party role still running is
 *     left first, and the next role waits out the host's leave drain, so the
 *     old role's hub `leave` cannot land on the new room;
 *   - remembers the party it queued with (its host keeps the hub token), so
 *     after the match `ui_join {code}` for that party code re-hosts it under
 *     the same code for its old host ("Return to lobby XXXXXX", MM-06) and
 *     joins it for everyone else;
 *   - refuses Practice while searching (`lobby_error practice`, PR-05);
 *   - keeps the session's `Inviter` (invites.ts) registered for the page's
 *     Invite popover, and shows a received invite in Lua as a toast
 *     (`mp_invited`, vars `name`, `code`; accepting is an ordinary `ui_join`).
 *
 * Browser-free, zod-free (MP chunk).
 */

import type { MpRuntime } from '../lobby/runtime';
import type { LobbyHost } from '../lobby/lobby-host';
import { LEAVE_DRAIN_MS } from '../lobby/lobby-host';
import type { LobbyState } from '../types';
import { Inviter, setActiveInviter } from '../invites';
import { QueueClient, type QueueMatched } from './queue-client';
import { CasualHost, autoReady } from './casual';
import { partyQueueBlock, rememberParty, type PartyMemory } from './party';

/** The old role's delayed hub `leave` (LobbyHost.leave) must reach the hub before the new role's first event. */
export const ROLE_SWITCH_MS = LEAVE_DRAIN_MS + 200;

const queued = new WeakMap<MpRuntime, QueueClient>();

/** PR-05: whether this session is searching for a match (Practice refuses to start meanwhile). */
export function isQueued(runtime: MpRuntime): boolean {
  return queued.get(runtime)?.isQueued() ?? false;
}

/** The party this session last queued with, for "Return to lobby XXXXXX" (MM-06). */
const parties = new WeakMap<MpRuntime, PartyMemory>();
export function lastParty(runtime: MpRuntime): PartyMemory | null {
  return parties.get(runtime) ?? null;
}

export function attach(runtime: MpRuntime): () => void {
  const { deps } = runtime;
  const { bridge, hub, sched } = deps;
  const offs: (() => void)[] = [];
  let casual: CasualHost | null = null;
  let cancelReady: (() => void) | null = null;
  let cancelSwitch: (() => void) | null = null;
  let detached = false;

  const error = (code: string) => bridge.send('lobby_error', { code: code.slice(0, 32) });

  const queue = new QueueClient({
    hub,
    contentHash: deps.contentHash,
    onView: (v) => {
      const d: { state: typeof v.state; queueMode: typeof v.queueMode; waiting?: number } = { state: v.state, queueMode: v.queueMode };
      if (v.waiting !== undefined) d.waiting = Math.max(0, v.waiting);
      bridge.send('queue_view', d);
    },
    onMatched: (m) => onMatched(m),
    onError: error,
  });
  queued.set(runtime, queue);

  const inviter = new Inviter(hub, sched);
  setActiveInviter(inviter);

  const stopCasual = () => {
    casual?.stop();
    casual = null;
    cancelReady?.();
    cancelReady = null;
  };

  /** When the last role this module left has surely had its hub `leave` delivered. */
  let quietAt = 0;

  /** Leave whatever role runs (a party lobby) now; the next role waits for `quietAt`. */
  const leaveRole = () => {
    const old = runtime.role;
    if (!old) return;
    old.leave();
    old.stop();
    if (old.kind === 'host') quietAt = Math.max(quietAt, sched.now() + ROLE_SWITCH_MS);
  };

  /** Leave the old role, then run `next` once the hub has seen the leave. */
  const switchRole = (next: () => void) => {
    cancelSwitch?.();
    cancelSwitch = null;
    stopCasual();
    leaveRole();
    const wait = quietAt - sched.now();
    if (wait <= 0) return next();
    cancelSwitch = sched.after(wait, () => {
      cancelSwitch = null;
      if (!detached) next();
    });
  };

  /** Remember the party lobby on screen; its host also keeps the hub token for the reclaim. */
  const remember = (lobby: LobbyState) => {
    const role = runtime.role;
    const token = role?.kind === 'host' ? (role as LobbyHost).hostToken : null;
    const prev = parties.get(runtime);
    const keep = prev && prev.code === lobby.code ? prev.token : null;
    parties.set(runtime, rememberParty(lobby, sched.now(), token ?? keep));
  };

  const onMatched = (m: QueueMatched) => {
    const lobby = runtime.role?.lobby() ?? null;
    if (lobby?.kind === 'party' && runtime.me) remember(lobby);
    if (m.role === 'host') {
      switchRole(() => {
        const host = runtime.createLobby(m.queueMode, 'casual');
        if (!host) return;
        queue.reset();
        casual = new CasualHost(
          host as LobbyHost,
          {
            sched,
            randomInt: () => deps.randomInt(),
            log: (msg) => deps.log(msg),
            onEnd: (why) => {
              if (why === 'no-players') error('no-players');
              casual = null;
            },
          },
          m.waiting,
        );
      });
      return;
    }
    if (!m.code) {
      // Matched; the host is still opening the room. A party lobby is over now (the hub closed it).
      stopCasual();
      leaveRole();
      return;
    }
    const code = m.code;
    switchRole(() => {
      const member = runtime.joinCode(code, 'player');
      if (!member) return;
      queue.reset();
      cancelReady = autoReady(sched, () => {
        const r = runtime.role;
        if (!r || r.code !== code || r.kind !== 'member') return false;
        r.ready(true);
        return true;
      });
    });
  };

  offs.push(
    bridge.on('ui_queue', (d) => {
      if (d.op === 'leave') {
        queue.cancel();
        return;
      }
      if (!runtime.me) return error('auth-required');
      if (runtime.practice) return error('practice');
      if (runtime.role) return error('in-lobby');
      queue.find(d.queueMode);
    }),
    bridge.on('ui_party_queue', (d) => {
      if (!runtime.me) return error('auth-required');
      const role = runtime.role;
      const lobby: LobbyState | null = role?.kind === 'host' ? role.lobby() : null;
      const block = partyQueueBlock(lobby, runtime.me);
      if (block || !lobby) return error(`party-${block ?? 'not-party'}`);
      remember(lobby);
      queue.findParty(lobby.code, d.queueMode);
    }),
    // A lobby the player left on purpose ends the casual controller (and any search with it).
    bridge.on('ui_leave', () => {
      stopCasual();
      cancelSwitch?.();
      cancelSwitch = null;
      if (queue.isQueued()) queue.cancel();
    }),
    hub.on('balatro:invited', (d) => {
      bridge.send('toast', { key: 'mp_invited', vars: { name: d.fromName.slice(0, 64), code: d.code } });
    }),
  );

  // PR-05: never queued and practising at once — Practice is refused while searching.
  runtime.practiceGuard = () => (queue.isQueued() ? 'practice' : null);

  // MM-06: the old party host re-hosts its party code; everyone else joins it. Both leave the
  // match lobby first (a host's leave must reach the hub before the next role's first event).
  runtime.joinHook = (code) => {
    const p = parties.get(runtime);
    if (!p || p.code !== code || !runtime.me) return false;
    if (runtime.role?.code === code) return true;
    if (queue.isQueued()) queue.cancel();
    if (p.hostId === runtime.me && p.token) {
      const reclaim = { code, token: p.token };
      switchRole(() => {
        if (runtime.createLobby(p.queueMode, 'party', reclaim)) queue.reset();
      });
    } else {
      switchRole(() => {
        if (runtime.joinCode(code, 'player')) queue.reset();
      });
    }
    return true;
  };

  return () => {
    if (detached) return;
    detached = true;
    if (runtime.practiceGuard) runtime.practiceGuard = null;
    if (runtime.joinHook) runtime.joinHook = null;
    cancelSwitch?.();
    stopCasual();
    for (const off of offs.splice(0)) off();
    queue.stop();
    queued.delete(runtime);
    inviter.stop();
    setActiveInviter(null);
  };
}
