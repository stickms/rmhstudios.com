/**
 * RMHbox — wiring between the LobbyManager and a durable LobbyStore
 * (redesign D2, step 2). Constructed only when `openLobbyStore()` returned a
 * store, so with `RMHBOX_DURABLE_LOBBIES` unset none of this runs.
 *
 * Save points:
 *  - `markDirty(id)`: LobbyManager.onLobbyChanged, which fires from
 *    broadcastAction (every client-visible lobby mutation goes out as an
 *    action), full syncs at phase boundaries, lobby creation and session end.
 *    Saves are coalesced per lobby: the first change arms one timer and the
 *    lobby is written once when it fires (≤ 2 writes/s per busy lobby).
 *  - `remove(id)`: LobbyManager.onLobbyRemoved, at disband.
 *  - `shutdown()`: every lobby, awaited by the hub's graceful shutdown.
 *
 * A failed write is logged and dropped: gameplay never waits on the store.
 */

import type { LobbyManager } from './lobby-manager';
import { deserializeLobby, planRestore, serializeLobby, type LobbyStore } from './lobby-store';

/** Coalescing window for per-lobby saves. */
export const SAVE_DEBOUNCE_MS = 500;

interface PersistenceLogger {
  info(entry: Record<string, unknown>): void;
  warn(entry: Record<string, unknown>): void;
}

export interface RestoreSummary {
  restored: number;
  dropped: number;
}

export class LobbyPersistence {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;

  constructor(
    private readonly store: LobbyStore,
    private readonly lobbyManager: LobbyManager,
    private readonly logger: PersistenceLogger,
  ) {}

  /** Install the LobbyManager hooks. */
  attach(): void {
    this.lobbyManager.onLobbyChanged = (id) => this.markDirty(id);
    this.lobbyManager.onLobbyRemoved = (id) => this.remove(id);
  }

  markDirty(lobbyId: string): void {
    if (this.closed || this.timers.has(lobbyId)) return;
    // Per-change debounce, not a periodic sweep: armed by a mutation, gone after one write.
    const timer = setTimeout(() => {
      this.timers.delete(lobbyId);
      void this.flush(lobbyId);
    }, SAVE_DEBOUNCE_MS);
    timer.unref?.();
    this.timers.set(lobbyId, timer);
  }

  private async flush(lobbyId: string): Promise<void> {
    if (this.closed) return;
    const lobby = this.lobbyManager.getLobby(lobbyId);
    if (!lobby || lobby.state === 'DISBANDED') return;
    try {
      await this.store.save(serializeLobby(lobby, this.lobbyManager.getSeq(lobbyId)));
    } catch (err) {
      this.logger.warn({ event: 'durable_lobby_save_failed', lobbyId, error: String(err) });
    }
  }

  remove(lobbyId: string): void {
    const timer = this.timers.get(lobbyId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(lobbyId);
    }
    if (this.closed) return;
    this.store.remove(lobbyId).catch((err: unknown) => {
      this.logger.warn({ event: 'durable_lobby_remove_failed', lobbyId, error: String(err) });
    });
  }

  /**
   * Write every live lobby and close the store. Called once from the hub's
   * shutdown; the hub's forced-exit timer bounds how long it may take.
   */
  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    const entries = [];
    for (const lobby of this.lobbyManager.getLobbies().values()) {
      if (lobby.state === 'DISBANDED') continue;
      entries.push(serializeLobby(lobby, this.lobbyManager.getSeq(lobby.id)));
    }
    try {
      await this.store.saveAll(entries);
      this.logger.info({ event: 'durable_lobbies_saved', count: entries.length });
    } catch (err) {
      this.logger.warn({ event: 'durable_lobbies_save_all_failed', count: entries.length, error: String(err) });
    }
    await this.store.close().catch(() => {});
  }

  /**
   * Read every stored lobby back into the LobbyManager. Run at boot, before
   * the hub listens. Never throws: a corrupt, wrong-version or unrestorable
   * entry is logged and deleted.
   */
  async restore(): Promise<RestoreSummary> {
    const summary: RestoreSummary = { restored: 0, dropped: 0 };
    let entries;
    try {
      entries = await this.store.loadAll();
    } catch (err) {
      this.logger.warn({ event: 'durable_lobbies_load_failed', error: String(err) });
      return summary;
    }

    for (const entry of entries) {
      const decoded = deserializeLobby(entry.data);
      if (!decoded || decoded.lobby.id !== entry.id) {
        this.logger.warn({ event: 'durable_lobby_corrupt', lobbyId: entry.id });
        await this.drop(entry.id, summary);
        continue;
      }
      const plan = planRestore(decoded.lobby);
      if (!plan.restore) {
        this.logger.info({ event: 'durable_lobby_not_restored', lobbyId: entry.id, reason: plan.reason });
        await this.drop(entry.id, summary);
        continue;
      }
      if (!this.lobbyManager.restoreLobby(plan.lobby, decoded.seq, plan.roundCancelled)) {
        this.logger.warn({ event: 'durable_lobby_not_restored', lobbyId: entry.id, reason: 'conflict' });
        await this.drop(entry.id, summary);
        continue;
      }
      summary.restored++;
      // Restore changed it (state, chat, seq): write the new shape back.
      this.markDirty(entry.id);
    }
    this.logger.info({ event: 'durable_lobbies_restored', ...summary });
    return summary;
  }

  private async drop(lobbyId: string, summary: RestoreSummary): Promise<void> {
    summary.dropped++;
    try {
      await this.store.remove(lobbyId);
    } catch (err) {
      this.logger.warn({ event: 'durable_lobby_remove_failed', lobbyId, error: String(err) });
    }
  }
}
