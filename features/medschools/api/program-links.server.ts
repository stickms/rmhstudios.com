import sites from '../../../data/medschools/program-sites.json';
import mdphd from '../../../data/medschools/mdphd-programs.json';
import schoolPages from '../../../data/medschools/school-pages.json';

/**
 * The school's own pages for its degree and its combined degree, from the two hand-read data files (the admissions
 * page in `school-pages.json`, the MD-PhD or DO-PhD program page in `mdphd-programs.json`). Each is null where the
 * school has none: no combined program, or no page read. Server-side only; the files are not shipped to the client.
 */
export interface ProgramLinks {
  /** The school's own MD or DO program homepage (`program-sites.json`); the registry's `website` wins over it. */
  websiteUrl: string | null;
  /** The school's own admissions page for its MD or DO degree. */
  admissionsUrl: string | null;
  /** The MD-PhD (DO-PhD) program page; null for a school with no combined program. */
  mdphdUrl: string | null;
}

const admissions = new Map<string, string | null>(
  schoolPages.schools.map((s) => [s.slug, s.admissions?.url ?? null] as const),
);
const phd = new Map<string, string | null>(
  mdphd.schools.map((s) => [s.slug, s.exists && s.url ? s.url : null] as const),
);

const siteOf = sites.sites as Record<string, string>;
const extraPhd = sites.mdphd as Record<string, string>;

export function programLinksOf(slug: string): ProgramLinks {
  return {
    websiteUrl: siteOf[slug] ?? null,
    admissionsUrl: admissions.get(slug) ?? null,
    mdphdUrl: phd.get(slug) ?? extraPhd[slug] ?? null,
  };
}
