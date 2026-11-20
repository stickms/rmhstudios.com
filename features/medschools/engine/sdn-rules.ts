/**
 * SDN text rules shared by the parser and (Task 5) the extractor: redaction of person-shaped strings from forum text
 * and the check that a model output does not repeat a page handle.
 */

/** Handles shorter than this are not matched as words (a 2-letter "handle" would shred ordinary text). */
const MIN_HANDLE_LENGTH = 3;

const URL_RE =
  /(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const EMAIL_RE =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const MENTION_RE =
  /@\w(?:[\w.-]*\w)?/g;

function escapeRe(
  s: string,
): string {
  return s.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

/** A case-insensitive matcher for any of the handles on word boundaries, or null when none qualify. */
function handleMatcher(
  handles: Iterable<string>,
): RegExp | null {
  const usable =
    [
      ...new Set(
        [
          ...handles,
        ]
          .map(
            (
              h,
            ) =>
              h.trim(),
          )
          .filter(
            (
              h,
            ) =>
              h.length >=
              MIN_HANDLE_LENGTH,
          ),
      ),
    ];
  if (
    usable.length ===
    0
  )
    return null;
  // Longest first so "abc_def" wins over "abc_".
  usable.sort(
    (
      a,
      b,
    ) =>
      b.length -
      a.length,
  );
  return new RegExp(
    `(?<![\\w])(?:${usable.map(escapeRe).join('|')})(?![\\w])`,
    'gi',
  );
}

/** Replaces URLs with [link], emails with [email], @mentions and any page handle with [user]. */
export function redactForModel(
  text: string,
  handles: Iterable<string> = [],
): string {
  let out =
    text
      .replace(
        URL_RE,
        '[link]',
      )
      .replace(
        EMAIL_RE,
        '[email]',
      )
      .replace(
        MENTION_RE,
        '[user]',
      );
  const re =
    handleMatcher(
      handles,
    );
  if (
    re
  )
    out =
      out.replace(
        re,
        '[user]',
      );
  return out;
}

/** True when `text` contains any of the handles (case-insensitive, on word boundaries). */
export function containsHandle(
  text: string,
  handles: Iterable<string>,
): boolean {
  const re =
    handleMatcher(
      handles,
    );
  return re
    ? re.test(
        text,
      )
    : false;
}
