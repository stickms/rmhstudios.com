/**
 * The replay/spectate service of one MP session (WS13): the `ReplayTap` the
 * runtime's roles call, plus the Lua intents of the feature.
 *
 * Recording (REP-01/02):
 *   - Lua sends this player's own log as `log {batch}` (the runtime relays the
 *     same batches to every peer through the host); the other players' logs
 *     arrive here through `peerLog`. Each match is assembled into a
 *     `Recording` (one `PlayerLog` per player, D-34 caps per player).
 *   - When the own log reaches `end`, its `chk` (REP-05, canonical-hash.ts) is
 *     appended and sent to the peers, and the match is saved to My Replays;
 *     later peer events re-save it (debounced). A match left without an `end`
 *     is saved when the next one starts or the session stops.
 *   - Host: a spectator joining mid-match gets every log so far (`catchUp`),
 *     paced under the receiver's `log` rate limit.
 * Playback (REP-03/05): `ui_replay list|open|pov|speed|seek|close` — the list
 * from the store, a stored match opened for one POV (`replay_view.playing` +
 * `replay_feed`), hash-checked (a mismatch shows "may be inaccurate").
 * Spectating (REP-04, MM-07): `ui_spectate_list` (the hub directory) and the
 * spectator's live feed (spectate.ts).
 *
 * Browser-free, zod-free (MP chunk).
 */

import type { L2JData } from '../bridge-protocol';
import type { BridgeLike, HubLike, Scheduler } from '../transport/types';
import type { Id, ReplayEvent, StartedMatch } from '../types';
import { SpectateDirectory, SpectateFeed } from '../spectate';
import { makeChk, verifyChk } from './canonical-hash';
import { chunkEvents, PlayerLog, REPLAY_LIMITS, resultOf } from './log';
import { sendFeed, sendList, sendOpen } from './player-feed';
import type { ReplayRecord, ReplayStore } from './store';
import type { LogBatch, ReplayTap } from './tap';

/** Re-save a finished match this long after the last late peer event. */
export const RESAVE_MS = 2_000;
/** Spectator catch-up pacing: frames sent at once, then per second (the receiver allows 1024 burst, 20/s). */
export const CATCHUP_BURST = 800;
export const CATCHUP_PER_SEC = 15;

export interface ReplayServiceDeps {
  bridge: BridgeLike;
  hub: HubLike;
  sched: Scheduler;
  store: ReplayStore;
  me(): Id | null;
  /** The match this peer plays now (a practice session too), or null. */
  current(): { match: StartedMatch; practice: boolean } | null;
  /** Send this player's own `log` frame to every peer (the role's relay). */
  sendOwn(d: LogBatch): void;
  log(msg: string, isError?: boolean): void;
}

interface Recording {
  match: StartedMatch;
  practice: boolean;
  me: Id;
  logs: Map<Id, PlayerLog>;
  /** The own log ended and was saved once. */
  finished: boolean;
  chkSent: boolean;
  resave: (() => void) | null;
}

interface Open {
  id: string;
  rec: ReplayRecord;
  pov: Id;
}

export class ReplayService implements ReplayTap {
  private rec: Recording | null = null;
  private open: Open | null = null;
  private speed = 1;
  readonly feed: SpectateFeed;
  readonly directory: SpectateDirectory;
  private readonly offs: (() => void)[] = [];
  private stopped = false;
  private readonly catchUps = new Set<() => void>();

  constructor(private readonly deps: ReplayServiceDeps) {
    this.feed = new SpectateFeed(deps.bridge);
    this.directory = new SpectateDirectory(deps.hub, deps.bridge, deps.sched);
    const b = deps.bridge;
    this.offs.push(
      b.on('log', (d) => this.ownBatch(d.batch)),
      b.on('ui_replay', (d) => void this.onUi(d)),
      b.on('ui_spectate_list', () => this.directory.request()),
      b.on('ui_spectate', () => this.leftSpectate()),
      b.on('ui_leave', () => this.leftSpectate()),
    );
  }

  /* ─── Recording ─── */

  /** The recording for the current match (created on first use; a different match finishes the old one). */
  private recording(): Recording | null {
    const cur = this.deps.current();
    const me = this.deps.me() ?? (cur?.practice ? 'me' : null);
    if (!cur || !me) return this.rec;
    if (this.rec && this.rec.match.runId === cur.match.runId) return this.rec;
    if (this.rec) void this.save(this.rec);
    const logs = new Map<Id, PlayerLog>();
    for (const r of cur.match.roster) logs.set(r.id, new PlayerLog(r.id));
    if (!logs.has(me)) logs.set(me, new PlayerLog(me));
    this.rec = { match: cur.match, practice: cur.practice, me, logs, finished: false, chkSent: false, resave: null };
    return this.rec;
  }

  /** Lua's own log batch. */
  ownBatch(batch: readonly unknown[]): void {
    if (this.stopped) return;
    const rec = this.recording();
    if (!rec) return;
    const own = rec.logs.get(rec.me) as PlayerLog;
    own.add(batch);
    if (!rec.chkSent && own.ended()) this.finishOwn(rec);
    else if (rec.finished) this.scheduleResave(rec);
  }

  private finishOwn(rec: Recording): void {
    rec.chkSent = true;
    const own = rec.logs.get(rec.me) as PlayerLog;
    const chk = makeChk(own.events());
    own.add([chk]);
    if (!rec.practice) this.deps.sendOwn({ runId: rec.match.runId, batch: [chk] });
    rec.finished = true;
    void this.save(rec);
  }

  peerLog(from: Id, d: LogBatch): void {
    if (this.stopped) return;
    if (this.feed.match?.runId === d.runId) {
      this.feed.add(from, d.runId, d.batch);
      if (this.feed.finished()) void this.saveSpectated();
      return;
    }
    const rec = this.recording();
    if (!rec || rec.match.runId !== d.runId || from === rec.me) return;
    const log = rec.logs.get(from);
    if (!log) return;
    log.add(d.batch);
    if (rec.finished) this.scheduleResave(rec);
  }

  private scheduleResave(rec: Recording): void {
    if (rec.resave) return;
    rec.resave = this.deps.sched.after(RESAVE_MS, () => {
      rec.resave = null;
      void this.save(rec);
    });
  }

  private recordOf(rec: Recording): ReplayRecord {
    const logs: Record<Id, ReplayEvent[]> = {};
    const truncated: Record<Id, boolean> = {};
    for (const [id, log] of rec.logs) {
      if (log.contiguous > 0) logs[id] = log.events();
      if (log.truncated) truncated[id] = true;
    }
    const names = new Map(rec.match.roster.map((r) => [r.id, r.name] as const));
    return {
      id: rec.match.runId,
      at: rec.match.startedAt,
      savedAt: this.deps.sched.now(),
      kind: rec.practice ? 'practice' : 'match',
      me: rec.me,
      queueMode: rec.match.queueMode,
      ruleset: rec.match.ruleset,
      players: [...rec.logs.keys()].map((id) => ({ id, name: names.get(id) ?? 'Player' })),
      result: resultOf(rec.logs.get(rec.me)?.ended()),
      logs,
      truncated,
    };
  }

  private async save(rec: Recording): Promise<void> {
    const r = this.recordOf(rec);
    if (!Object.keys(r.logs).length) return;
    await this.deps.store.put(r).catch((err) => this.deps.log(`[mp replay] not saved: ${String(err)}`));
  }

  private async saveSpectated(): Promise<void> {
    const m = this.feed.match;
    const me = this.deps.me();
    if (!m || !me) return;
    const logs: Record<Id, ReplayEvent[]> = {};
    for (const [id, log] of this.feed.logs) if (log.contiguous > 0) logs[id] = log.events();
    if (!Object.keys(logs).length) return;
    await this.deps.store
      .put({
        id: m.runId,
        at: m.startedAt,
        savedAt: this.deps.sched.now(),
        kind: 'spectated',
        me,
        queueMode: m.queueMode,
        ruleset: m.ruleset,
        players: m.roster.map((r) => ({ id: r.id, name: r.name })),
        result: null,
        logs,
      })
      .catch(() => undefined);
  }

  /** Host: bring a mid-match spectator up to date (every log held for `runId`). */
  catchUp(runId: string, send: (from: Id, d: LogBatch) => boolean): void {
    const rec = this.rec;
    if (!rec || rec.match.runId !== runId) return;
    const queue: { from: Id; d: LogBatch }[] = [];
    for (const [id, log] of rec.logs) {
      for (const batch of chunkEvents(log.events())) queue.push({ from: id, d: { runId, batch } });
    }
    if (!queue.length) return;
    let budget = CATCHUP_BURST;
    const pump = () => {
      while (queue.length && budget >= 1) {
        const item = queue.shift() as { from: Id; d: LogBatch };
        budget -= 1;
        if (!send(item.from, item.d)) {
          queue.length = 0;
          break;
        }
      }
      if (!queue.length) stop();
    };
    let cancel: (() => void) | null = null;
    const stop = () => {
      cancel?.();
      this.catchUps.delete(stop);
    };
    pump();
    if (!queue.length) return;
    cancel = this.deps.sched.every(1000 / CATCHUP_PER_SEC, () => {
      budget = Math.min(budget + 1, CATCHUP_BURST);
      pump();
    });
    this.catchUps.add(stop);
  }

  /* ─── Spectating ─── */

  /** ReplayTap.spectate: the spectator's match (welcome / start_game). */
  spectate(match: StartedMatch): void {
    if (this.stopped) return;
    if (this.feed.match && this.feed.match.runId !== match.runId) void this.saveSpectated();
    this.feed.start(match);
  }

  private leftSpectate(): void {
    if (this.feed.match) void this.saveSpectated();
    this.feed.stop();
  }

  /* ─── Playback intents ─── */

  async onUi(d: L2JData<'ui_replay'>): Promise<void> {
    if (this.stopped) return;
    switch (d.op) {
      case 'list':
        return sendList(this.deps.bridge, await this.deps.store.list());
      case 'open':
        if (typeof d.id === 'string') await this.openReplay(d.id, null);
        return;
      case 'pov': {
        const id = typeof d.value === 'string' ? d.value : null;
        if (!id) return;
        if (this.feed.match) {
          this.feed.setPov(id);
          return;
        }
        if (this.open && this.open.rec.logs[id]) this.feedOpen(this.open.rec, id);
        return;
      }
      case 'speed':
        if (typeof d.value === 'number' && [0, 1, 2, 4].includes(d.value)) this.speed = d.value;
        return;
      case 'seek':
        return; // Lua seeks in the log it holds
      case 'close':
        this.open = null;
        return;
    }
  }

  private async openReplay(id: string, pov: Id | null): Promise<void> {
    const rec = await this.deps.store.get(id);
    if (!rec) {
      this.deps.bridge.send('toast', { key: 'rmh_mp_replay_missing' });
      return;
    }
    const who = pov && rec.logs[pov] ? pov : rec.logs[rec.me] ? rec.me : Object.keys(rec.logs)[0];
    if (!who) return;
    this.feedOpen(rec, who);
    let inaccurate = false;
    for (const events of Object.values(rec.logs)) {
      if (verifyChk(events) === 'mismatch') inaccurate = true;
    }
    if (inaccurate) this.deps.bridge.send('toast', { key: 'rmh_mp_replay_inaccurate' });
  }

  private feedOpen(rec: ReplayRecord, pov: Id): void {
    this.open = { id: rec.id, rec, pov };
    const events = rec.logs[pov] ?? [];
    sendOpen(this.deps.bridge, rec.id, pov, events.length, this.speed);
    sendFeed(this.deps.bridge, pov, events);
  }

  /* ─── Lifecycle ─── */

  stop(): void {
    if (this.stopped) return;
    if (this.rec) {
      this.rec.resave?.();
      void this.save(this.rec);
    }
    if (this.feed.match) void this.saveSpectated();
    this.stopped = true;
    for (const c of [...this.catchUps]) c();
    for (const off of this.offs.splice(0)) off();
    this.directory.stop();
    this.feed.stop();
  }
}

export { REPLAY_LIMITS };
