import { normalizeSchoolKey } from '../../../engine/names';

/** School keys from sitemap.xml, decoded once by normalizeSchoolKey, de-duplicated in order. */
export function parseSitemap(
  xml: string,
): {
  schoolKeys: string[];
  historicalKeys: string[];
} {
  const schoolKeys: string[] =
    [];
  const historicalKeys: string[] =
    [];
  const seenS =
    new Set<string>();
  const seenH =
    new Set<string>();
  for (const m of xml.matchAll(
    /<loc>\s*[^<]*?\/explorer\/school\/([^<]+?)\s*<\/loc>/g,
  )) {
    const tail =
      m[1]!;
    const q =
      tail.indexOf(
        '?',
      );
    const historical =
      q >=
        0 &&
      /(^|&)view=historical(&|$)/.test(
        tail.slice(
          q +
            1,
        ),
      );
    const key =
      normalizeSchoolKey(
        q >=
          0
          ? tail.slice(
              0,
              q,
            )
          : tail,
      );
    if (
      q >=
        0 &&
      !historical
    )
      continue;
    const [
      list,
      seen,
    ] =
      historical
        ? [
            historicalKeys,
            seenH,
          ]
        : [
            schoolKeys,
            seenS,
          ];
    if (
      !seen.has(
        key,
      )
    ) {
      seen.add(
        key,
      );
      list.push(
        key,
      );
    }
  }
  return {
    schoolKeys,
    historicalKeys,
  };
}
