/**
 * How the sign-in providers sit on the login page: rows that fill evenly, never a lone button on its own line.
 *
 * Four fit across the form, so up to four is one row. More than that is split into the fewest rows and then spread
 * evenly (no two rows differ by more than one): five is three above two, six is three above three, seven is four above three. `columns` is the width of a
 * full row in cells, so a shorter row keeps the same cell size and is centred beneath the longer one.
 *
 * Client-safe.
 */
export interface ProviderRows<T> {
  rows: T[][];
  columns: number;
}

export function balanceProviderRows<T>(items: readonly T[], maxPerRow = 4): ProviderRows<T> {
  if (items.length === 0) return { rows: [], columns: 1 };
  const rowCount = Math.ceil(items.length / maxPerRow);
  const base = Math.floor(items.length / rowCount);
  const extra = items.length % rowCount;
  const rows: T[][] = [];
  let at = 0;
  for (let r = 0; r < rowCount; r++) {
    // The longer rows come first, so the widest one is on top.
    const size = base + (r < extra ? 1 : 0);
    rows.push(items.slice(at, at + size));
    at += size;
  }
  return { rows, columns: base + (extra > 0 ? 1 : 0) };
}
