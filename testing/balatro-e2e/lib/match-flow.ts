/**
 * Match-level helpers for the match project (PLAN §6.3): build a lobby from real
 * players (MpPlayer, the engine) and bot peers (BotPeer, no engine), set options,
 * start, and play antes.
 */
import type { BotPeer } from './bot';
import type { MpPlayer, MpSnap } from './mp-player';
import { waitFor } from './stack';

export type Peer = MpPlayer | BotPeer;
export const isBot = (p: Peer): p is BotPeer => 'outcomes' in p;

/** Options that keep a match short (PLAN §6.3 header). */
export const SHORT: Record<string, unknown> = { pvpStartRound: 1, startingLives: 1, timer: false };

export async function lobbyCode(host: Peer, timeoutMs = 120_000): Promise<string> {
  if (isBot(host)) {
    let code = '';
    await host.waitState((s) => !!(code = s.code ?? ''), 'lobby code', timeoutMs);
    return code;
  }
  try {
    return (await host.waitSnap((s) => !!s.code && s.role === 'host', 'lobby code', timeoutMs)).code!;
  } catch (e) {
    // Why the hub or the runtime refused (seat-held, rate-limited …): what Lua was told.
    const refused = await host
      .cmd<{ list: { d: unknown }[] }>('mp_inbox', { t: 'lobby_error' })
      .then((r) => JSON.stringify(r.list.map((x) => x.d)))
      .catch(() => '?');
    throw new Error(`${(e as Error).message}\nlobby_error messages: ${refused}`, { cause: e });
  }
}

/**
 * Create a private lobby and return its code. The previous scenario's account has just
 * left its lobby (often within the host's leave drain); the session sends that leave
 * before this create, so the hub has released the seat and the create is accepted —
 * a `seat-held` refusal here is the bug this proves fixed, and fails the test.
 */
export async function create(host: Peer, queueMode: string): Promise<string> {
  if (isBot(host)) {
    await host.ui('ui_create_lobby', { queueMode, kind: 'private' });
    return lobbyCode(host);
  }
  await host.ui('create', { queueMode, kind: 'private' });
  return lobbyCode(host);
}

export async function setOptions(host: Peer, options: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(options)) {
    if (isBot(host)) await host.ui('ui_set_option', { key, value });
    else await host.ui('option', { key, value });
  }
}

export async function join(
  p: Peer,
  code: string,
  role: 'player' | 'spectator' = 'player',
): Promise<void> {
  if (isBot(p)) await p.ui(role === 'player' ? 'ui_join' : 'ui_spectate', { code });
  else if (role === 'player') await p.ui('join', { code });
  else
    await p
      .cmd('mp', { fn: 'ui', args: { op: 'spectate', code } })
      .catch(async () => p.page.evaluate(() => 0));
}

/**
 * The host has admitted this player: it is in the lobby's player list. `role === 'member'`
 * holds as soon as the join is sent; a scenario that depends on join ORDER (the successor is
 * the earliest-admitted player) must wait for this before anyone else joins, or a bot's
 * faster join can be admitted first.
 */
export const admitted = (s: MpSnap): boolean =>
  !!s.me && !!s.lobby?.players.some((x) => x.id === s.me);

/** The host's lobby state (from the session runtime snapshot). */
export async function hostLobby(host: Peer): Promise<NonNullable<MpSnap['lobby']>> {
  const s = (isBot(host) ? await host.state() : await host.snap()) as unknown as MpSnap;
  if (!s.lobby) throw new Error('no lobby');
  return s.lobby;
}

export async function waitPlayers(host: Peer, n: number, timeoutMs = 180_000): Promise<void> {
  await waitFor(
    `${n} players in the lobby`,
    async () =>
      (await hostLobby(host).catch(() => null))?.players.filter((p) => p.role === 'player')
        .length === n,
    timeoutMs,
    1000,
  );
}

export async function readyAll(members: Peer[]): Promise<void> {
  for (const m of members) if (!isBot(m)) await m.cmd('ready');
}

export async function waitReady(host: Peer, timeoutMs = 120_000): Promise<void> {
  await waitFor(
    'everyone ready',
    async () => {
      const l = await hostLobby(host).catch(() => null);
      return (
        !!l &&
        l.players.filter((p) => p.role === 'player' && p.id !== l.hostId).every((p) => p.ready)
      );
    },
    timeoutMs,
    1000,
  );
}

export async function start(host: Peer, all: Peer[], timeoutMs = 300_000): Promise<string> {
  if (isBot(host)) await host.ui('ui_start', {});
  else await host.ui('start');
  let runId = '';
  for (const p of all) {
    if (isBot(p)) await p.waitState((s) => !!(runId = s.runId ?? ''), 'match started', timeoutMs);
    else runId = (await p.waitSnap((s) => !!s.runId, 'match started', timeoutMs)).runId!;
  }
  // Real players: the run is at its first blind select.
  for (const p of all) if (!isBot(p)) await p.cmd('wait_state', ['BLIND_SELECT', 300], 320_000);
  return runId;
}

/** Create → options → join → ready → start. Returns the code and runId. */
export async function setupMatch(
  host: Peer,
  members: Peer[],
  queueMode: string,
  options: Record<string, unknown> = SHORT,
): Promise<{ code: string; runId: string }> {
  const code = await create(host, queueMode);
  await setOptions(host, options);
  for (const m of members) await join(m, code);
  await waitPlayers(host, members.length + 1);
  await readyAll(members);
  await waitReady(host);
  const runId = await start(host, [host, ...members]);
  return { code, runId };
}

export interface AnteResult {
  ante: number;
  state: string;
  result: string | null;
  lives: Record<string, number>;
  played?: number;
}

/** One ante for a real player: two normal blinds, the PvP round with `chips`, the shop. */
export function playAnte(
  p: MpPlayer,
  opts: { chips?: number; hands?: number } = {},
  timeoutMs = 600_000,
) {
  return p.cmd<AnteResult>('mp_ante', opts, timeoutMs);
}

/** The final result every real player ends on (MP.state.result.kind). */
export async function waitResult(p: MpPlayer, timeoutMs = 240_000): Promise<string> {
  let kind = '';
  await waitFor(
    `${p.label}: a match result`,
    async () => {
      const s = await p.cmd<{ result?: { kind?: string } }>('mp_state');
      kind = s.result?.kind ?? '';
      return kind !== '' && kind !== 'pending';
    },
    timeoutMs,
    1000,
  );
  return kind;
}

/**
 * Leave as a player does (the autopilot's mp_leave: the end screen's Leave, a forfeit while
 * a match runs, or ui_leave from a lobby), then wait until the page holds no lobby role and
 * no session is mounted (so a single-player run after it is vanilla again).
 */
export async function leaveMatch(
  p: MpPlayer,
  how: 'leave' | 'return_lobby' = 'leave',
): Promise<void> {
  await p.cmd('mp_leave', { how }, 180_000);
  if (how === 'leave') await p.waitSnap((x) => x.role === null, 'out of the lobby', 120_000);
}
