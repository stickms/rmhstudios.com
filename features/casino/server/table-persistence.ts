/**
 * Casino — wiring between one game's tables and a durable `CasinoTableStore`
 * (third-pass audit OP3). Constructed only when `openCasinoTableStore()`
 * returned a store, so with `CASINO_DURABLE_TABLES` unset none of this runs.
 *
 * Save points:
 *  - `markDirty(id)`: a change that moves no coins (a seat taken, a card
 *    drawn, a phase change). Coalesced per table: the first change arms one
 *    timer and the table is written once when it fires.
 *  - `saveNow(id)`: a change that follows a ledger write (a stake landed on a
 *    seat). Written at once, not awaited by the game.
 *  - `remove(id)`: the table is gone.
 *  - `saveAtShutdown(entries)`: every table, once, bounded by a deadline.
 *
 * Outside shutdown a failed write is logged and dropped: play never waits on
 * the store. At shutdown the caller gets the outcome and decides what happens
 * to the stakes.
 */

import type { CasinoGame } from './casino-shutdown';
import type { CasinoTableStore, TableEntry } from './table-store';

/** Coalescing window for per-table saves. */
export const SAVE_DEBOUNCE_MS = 500;

interface PersistenceLogger {
  info(entry: Record<string, unknown>): void;
  warn(entry: Record<string, unknown>): void;
  error(entry: Record<string, unknown>): void;
}

/**
 * `saved`: the store acknowledged every table. `failed`: the store rejected
 * the write. `unconfirmed`: no answer inside the deadline. In the last two the
 * tables may or may not be stored, and the store may still hold an older
 * write of each; the caller's refunds are keyed so that restore can tell.
 */
export type ShutdownSaveOutcome = 'saved' | 'failed' | 'unconfirmed';

export class TablePersistence {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;

  /**
   * @param snapshot the table's storable form right now, or `null` when it no longer exists.
   */
  constructor(
    private readonly store: CasinoTableStore,
    private readonly game: CasinoGame,
    private readonly snapshot: (id: string) => unknown | null,
    private readonly logger: PersistenceLogger,
  ) {}

  markDirty(id: string): void {
    if (this.closed || this.timers.has(id)) return;
    // Per-change debounce, not a periodic sweep: armed by a mutation, gone after one write.
    const timer = setTimeout(() => {
      this.timers.delete(id);
      void this.write(id);
    }, SAVE_DEBOUNCE_MS);
    timer.unref?.();
    this.timers.set(id, timer);
  }

  saveNow(id: string): void {
    void this.write(id);
  }

  /** The snapshot is taken synchronously, here; only the store call is awaited. */
  private write(id: string): Promise<void> {
    this.cancel(id);
    if (this.closed) return Promise.resolve();
    const data = this.snapshot(id);
    if (data === null) return Promise.resolve();
    return this.store.saveAll(this.game, [{ id, data }]).catch((err: unknown) => {
      this.logger.warn({ event: 'casino_table_save_failed', game: this.game, roomId: id, error: String(err) });
    });
  }

  remove(id: string): void {
    this.cancel(id);
    if (this.closed) return;
    this.store.remove(this.game, [id]).catch((err: unknown) => {
      this.logger.warn({ event: 'casino_table_remove_failed', game: this.game, roomId: id, error: String(err) });
    });
  }

  private cancel(id: string): void {
    const timer = this.timers.get(id);
    if (!timer) return;
    clearTimeout(timer);
    this.timers.delete(id);
  }

  /**
   * Shutdown: stop every coalesced save and write `entries` (snapshots the
   * caller took synchronously) in one all-or-none call, bounded by
   * `deadlineMs`. Never throws. Closes this object: later calls do nothing.
   */
  async saveAtShutdown(entries: TableEntry[], deadlineMs: number): Promise<ShutdownSaveOutcome> {
    this.closed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      this.store.saveAll(this.game, entries).then(
        (): ShutdownSaveOutcome => 'saved',
        (err: unknown): ShutdownSaveOutcome => {
          this.logger.error({
            event: 'casino_tables_save_failed',
            game: this.game,
            count: entries.length,
            error: String(err),
          });
          return 'failed';
        },
      ),
      new Promise<ShutdownSaveOutcome>((resolve) => {
        timer = setTimeout(() => resolve('unconfirmed'), deadlineMs);
      }),
    ]);
    clearTimeout(timer);
    if (outcome === 'saved') {
      this.logger.info({ event: 'casino_tables_saved', game: this.game, count: entries.length });
    }
    return outcome;
  }
}
