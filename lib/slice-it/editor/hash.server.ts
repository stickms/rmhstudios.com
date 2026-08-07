/**
 * Slice It chart editor — the canonical chart hash (C12).
 *
 * Design doc: `docs/slice-it-chart-editor.md` §1.1 / §11. The doc calls this
 * file `hash.ts`; it is `hash.server.ts` because it reaches for `node:crypto`,
 * and `lib/CLAUDE.md`'s first rule is that anything touching `node:*` carries the
 * `.server` suffix so the Vite plugin can stub it out of the client bundle.
 * Nothing in the browser needs it — the **server** re-derives the hash on every
 * write precisely so a client cannot claim an unedited chart's identity.
 *
 * Canonicalisation is the whole content of the function. Two note lists that
 * describe the same chart must hash the same however they were serialised, and
 * two that differ by a millisecond must not:
 *
 *  - **Order** is `(time, lane, id)`, matching `compareNotes` in `commands.ts`,
 *    so a chord's array order is not part of the chart's identity.
 *  - **Times** are rounded to the millisecond. Floating-point addition during a
 *    drag leaves `1.2000000000000002` where a reload leaves `1.2`, and a hash
 *    that changed on a round-trip through JSON would fire the "this chart was
 *    edited" signal on every open.
 *  - **Ids** are excluded from the hashed bytes. A note's id is storage identity,
 *    not musical identity — re-seeding a chart mints new ids for the same notes,
 *    and every leaderboard row would read that as a chart change.
 *  - **Absent optional fields** are omitted rather than written as `null`, so
 *    `{duration: undefined}` and a missing key agree.
 */

import { createHash } from 'node:crypto';
import type { Slice } from '@/lib/slice-it/types';

/** Milliseconds, as an integer — the resolution the game itself judges at. */
function ms(seconds: number): number {
  return Math.round(seconds * 1000);
}

/** The canonical string a chart hashes over. Exported for the test. */
export function canonicalChart(notes: readonly Slice[]): string {
  const rows = notes
    .map((note) => ({
      t: ms(note.time),
      l: Math.trunc(note.lane),
      y: note.type,
      d: note.duration != null ? ms(note.duration) : null,
      s: note.speedMultiplier != null ? Math.round(note.speedMultiplier * 1000) : null,
      id: note.id,
    }))
    .sort((a, b) => a.t - b.t || a.l - b.l || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return rows
    .map((row) => {
      const parts = [String(row.t), String(row.l), row.y];
      if (row.d != null) parts.push(`d${row.d}`);
      if (row.s != null) parts.push(`s${row.s}`);
      return parts.join(',');
    })
    .join('\n');
}

/** SHA-256 of {@link canonicalChart}, hex — 64 chars, the column's width. */
export function chartHashOf(notes: readonly Slice[]): string {
  return createHash('sha256').update(canonicalChart(notes), 'utf8').digest('hex');
}
