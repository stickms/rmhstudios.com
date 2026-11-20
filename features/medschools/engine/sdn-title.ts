/**
 * SDN thread titles and summary keys (phase 2b).
 *
 * A school thread is titled "YYYY-YYYY <school name>". The label is stripped
 * to get the alias key (the stem), and gives the cycle (D7, Q17). A title
 * without a consecutive-year label is not a school thread we can place: the
 * caller records it as a miss under its raw normalised title, never guesses.
 */
import { cycleYearFromLabel } from './cycle';
import { normalizeSchoolKey } from './names';

const LABELLED =
  /^(\d{4}-\d{4})\s+(.+)$/;

export function normalizeTitle(
  title: string,
): string {
  return normalizeSchoolKey(
    title,
  )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim();
}

export function parseThreadTitle(
  title: string,
): {
  cycleYear: number;
  stem: string;
} | null {
  const m =
    LABELLED.exec(
      normalizeTitle(
        title,
      ),
    );
  if (
    !m
  )
    return null;
  let cycleYear: number;
  try {
    cycleYear =
      cycleYearFromLabel(
        m[1]!,
      );
  } catch {
    return null;
  }
  return {
    cycleYear,
    stem: m[2]!.trim(),
  };
}

export const SDN_SUMMARY_PREFIX =
  'summary:';

/** The SDN alias key of a school's interview-feedback summary page. */
export function summaryKey(
  code: string,
  slug: string,
): string {
  return `${SDN_SUMMARY_PREFIX}${code}/${slug}`;
}

export function parseSummaryKey(
  key: string,
): {
  code: string;
  slug: string;
} | null {
  if (
    !key.startsWith(
      SDN_SUMMARY_PREFIX,
    )
  )
    return null;
  const m =
    /^([^/]+)\/([^/]+)$/.exec(
      key.slice(
        SDN_SUMMARY_PREFIX.length,
      ),
    );
  return m
    ? {
        code: m[1]!,
        slug: m[2]!,
      }
    : null;
}
