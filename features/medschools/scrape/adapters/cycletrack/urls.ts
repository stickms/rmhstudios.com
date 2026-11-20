import { SOURCES } from '../../sources';

/** Path form per capture finding (b): encodeURIComponent is safe for every key (`Texas A&M` -> `Texas%20A%26M`). */
export function schoolUrl(
  key: string,
  view?: 'historical',
): string {
  const base = `${SOURCES.CYCLETRACK.origin}/explorer/school/${encodeURIComponent(key)}`;
  return view ===
    'historical'
    ? `${base}?view=historical`
    : base;
}
