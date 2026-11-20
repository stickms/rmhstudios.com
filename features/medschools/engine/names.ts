const NAMED_ENTITIES: Record<
  string,
  string
> =
  {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };

function unescapeHtml(
  s: string,
): string {
  return s.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (
      whole,
      body: string,
    ) => {
      if (
        body[0] ===
        '#'
      ) {
        const code =
          body[1] ===
            'x' ||
          body[1] ===
            'X'
            ? parseInt(
                body.slice(
                  2,
                ),
                16,
              )
            : parseInt(
                body.slice(
                  1,
                ),
                10,
              );
        return Number.isFinite(
          code,
        )
          ? String.fromCodePoint(
              code,
            )
          : whole;
      }
      return (
        NAMED_ENTITIES[
          body.toLowerCase()
        ] ??
        whole
      );
    },
  );
}

/** HTML-unescape, then URL-decode, then trim. Never lowercases or corrects spelling: aliases match source spellings exactly. */
export function normalizeSchoolKey(
  raw: string,
): string {
  const unescaped =
    unescapeHtml(
      raw,
    );
  let decoded =
    unescaped;
  try {
    decoded =
      decodeURIComponent(
        unescaped,
      );
  } catch {
    // A literal '%' that is not an escape: keep the text as given.
  }
  return decoded.trim();
}

const CANADIAN =
  new Set(
    [
      'AB',
      'BC',
      'MB',
      'NB',
      'NL',
      'NS',
      'ON',
      'PE',
      'QC',
      'SK',
      'NT',
      'NU',
      'YT',
    ],
  );

/** True when the location ends in `, XX` with XX a Canadian province or territory code. */
export function isCanadianLocation(
  location: string,
): boolean {
  const m =
    /,\s*([A-Za-z]{2})\s*$/.exec(
      location,
    );
  return (
    m !==
      null &&
    CANADIAN.has(
      m[1]!.toUpperCase(),
    )
  );
}

export function slugify(
  name: string,
): string {
  return name
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      '-',
    )
    .replace(
      /^-+|-+$/g,
      '',
    );
}
