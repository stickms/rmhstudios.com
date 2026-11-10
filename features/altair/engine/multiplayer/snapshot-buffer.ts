// =============================================================================
// ALTAIR MULTIPLAYER -- Snapshot jitter buffer (pure)
// =============================================================================
// A client keeps the last few decoded snapshots with their ARRIVAL time and
// draws the world `RENDER_DELAY_MS` in the past, blending the two snapshots
// that bracket that moment (snapshot.ts: snapshotAlpha / interpolateSnapshots).
// With 20 Hz snapshots a 100 ms delay means there is normally a newer snapshot
// to blend toward, so motion is smooth even when packets arrive unevenly.
// =============================================================================

import { interpolateSnapshots, snapshotAlpha, type DecodedSnapshot } from './snapshot';

/** Guests draw this far behind the newest snapshot (two snapshot intervals at 20 Hz). */
export const GUEST_RENDER_DELAY_MS = 100;
/** The host loops its own snapshots back; one interval of delay keeps its own motion smooth. */
export const HOST_RENDER_DELAY_MS = 50;

const KEEP = 6;

interface Entry {
  snap: DecodedSnapshot;
  at: number;
}

export class SnapshotBuffer {
  private readonly entries: Entry[] = [];

  /** Add a snapshot that arrived at `at` (ms). Stale or duplicate ticks are ignored. Returns whether it was kept. */
  push(snap: DecodedSnapshot, at: number): boolean {
    const last = this.entries[this.entries.length - 1];
    if (last && snap.tick <= last.snap.tick) return false;
    // Arrival times must be strictly increasing for the alpha maths.
    const time = last && at <= last.at ? last.at + 1 : at;
    this.entries.push({ snap, at: time });
    if (this.entries.length > KEEP) this.entries.shift();
    return true;
  }

  get latest(): DecodedSnapshot | null {
    return this.entries.length ? this.entries[this.entries.length - 1].snap : null;
  }

  /** Arrival time of the newest snapshot (ms), or null. */
  get latestAt(): number | null {
    return this.entries.length ? this.entries[this.entries.length - 1].at : null;
  }

  clear(): void {
    this.entries.length = 0;
  }

  /**
   * The world as it should be drawn at `renderAt` (ms, same clock as `push`).
   * Null until the first snapshot has arrived.
   */
  sample(renderAt: number): DecodedSnapshot | null {
    const n = this.entries.length;
    if (n === 0) return null;
    if (n === 1) return this.entries[0].snap;
    // Newest entry that is not after renderAt.
    let i = -1;
    for (let k = n - 1; k >= 0; k--) {
      if (this.entries[k].at <= renderAt) {
        i = k;
        break;
      }
    }
    if (i < 0) return this.entries[0].snap; // before everything we have
    if (i === n - 1) {
      // Past the newest: extrapolate (bounded by MAX_ALPHA) from the previous pair.
      const a = this.entries[n - 2];
      const b = this.entries[n - 1];
      return interpolateSnapshots(a.snap, b.snap, snapshotAlpha(renderAt, a.at, b.at));
    }
    const a = this.entries[i];
    const b = this.entries[i + 1];
    return interpolateSnapshots(a.snap, b.snap, snapshotAlpha(renderAt, a.at, b.at));
  }
}
