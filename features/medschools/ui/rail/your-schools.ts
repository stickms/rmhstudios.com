import type { MedListDto, MedSchoolListItemDto, TrackerDto } from '../../medschools.contract';

/** "Your schools" shows at most this many rows. */
export const YOUR_SCHOOLS_MAX = 8;

/** The slugs of the member's own schools: the tracker's newest cycle and every list, each once. Pure. */
export function memberSlugs(tracker: TrackerDto | undefined, lists: { lists: MedListDto[] } | undefined): Set<string> {
  const out = new Set<string>();
  for (const a of tracker?.cycle?.applications ?? []) out.add(a.school.slug);
  for (const l of lists?.lists ?? []) for (const i of l.items) out.add(i.school.slug);
  return out;
}

export type YourSchoolRow = MedSchoolListItemDto & { latest: NonNullable<MedSchoolListItemDto['latest']> };

/**
 * The join behind "Your schools", done in the browser (owner 2026-11-24): WHICH schools come from the member's private
 * tracker and lists, WHAT happened from the public school list's `latest` (the live feed's rules), so the public
 * endpoint never learns who is asking. Schools with a public status only, newest first, at most `max`. Pure.
 */
export function yourSchools(
  slugs: ReadonlySet<string>,
  schools: readonly MedSchoolListItemDto[] | undefined,
  max: number = YOUR_SCHOOLS_MAX,
): YourSchoolRow[] {
  return (schools ?? [])
    .filter((s): s is YourSchoolRow => slugs.has(s.slug) && s.latest !== null)
    .sort((a, b) => b.latest.occurredAt.localeCompare(a.latest.occurredAt) || a.name.localeCompare(b.name))
    .slice(0, max);
}
