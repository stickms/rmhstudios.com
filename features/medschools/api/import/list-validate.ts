/**
 * The server's check of what the list import's model returned (owner 2026-11-24), and the only place that output becomes
 * something a member sees. The model is trusted with none of it:
 *
 *  - the envelope and every entry are checked against the schema (`import-schemas.ts`); a malformed entry costs that
 *    entry, not the import;
 *  - a name is kept only when the member's text holds it (folded for case and spacing); a name the model wrote that the
 *    text does not hold is dropped and counted, so an invented school never reaches the page;
 *  - a kept name resolves to a school only when it names exactly one active school: by its name, short name or slug
 *    (`matchSchool`, the tracker import's matcher, aliases included), else by the index search's rule
 *    (`schoolMatches`: a fragment of a name, short name or any alias, or exactly the initials of one, "UCSF"); two or
 *    more is ambiguous and the row is "Unrecognised school" for the member to pick, as is none. A slug or id from the
 *    model is never read;
 *  - a program is `PHD` only when the model says so AND a line of the text that holds the name says PhD or MSTP; `REG`
 *    when the model says just MD or DO and that line writes MD or DO; otherwise `ANY` (either program);
 *  - the file's order is kept, a school and program named twice is one row, and at most `LIST_IMPORT_LIMITS.schools`
 *    rows come back (`capped` says the rest was cut).
 *
 * Pure: the text and the directory are arguments, so every rule is a unit test.
 */
import { LIST_IMPORT_LIMITS, foldForMatch, programOf } from '../../engine/import';
import { schoolMatches } from '../../engine/public-read';
import type { MedListProgramId } from '../../medschools.contract';
import { listModelOutput, listModelRow } from '../import-schemas';
import { matchSchool, type AliasIndex, type ImportSchool } from './validate';

export interface ValidListRow {
  key: string;
  schoolName: string;
  school: ImportSchool | null;
  program: MedListProgramId;
}

export interface ValidatedList {
  rows: ValidListRow[];
  /** Names the text does not hold, or entries that were not a name. */
  dropped: number;
  /** More schools than a list holds: the rest were cut. */
  capped: boolean;
}

const PHD_WORD = /ph\.?\s*d|mstp/i;
/** MD or DO written as a word, and not the start of "MD-PhD". Case-sensitive: "do" is an English word. */
const PLAIN_DEGREE = /(?:^|[^A-Za-z])(?:MD|DO|M\.D\.|D\.O\.)(?![A-Za-z]|[\s/-]*[Pp][Hh])/;

/** Each alias spelling under the school it names, for the search rule's `terms`. */
function termsBySlug(aliases: AliasIndex): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [spelling, slugs] of aliases) {
    for (const slug of slugs) {
      const list = out.get(slug);
      if (list) list.push(spelling);
      else out.set(slug, [spelling]);
    }
  }
  return out;
}

/** The one active school a written name means, or null (none, or more than one). */
export function resolveListName(
  name: string,
  dir: readonly ImportSchool[],
  aliases: AliasIndex,
  terms: ReadonlyMap<string, readonly string[]> = termsBySlug(aliases),
): ImportSchool | null {
  const exact = matchSchool(name, dir, aliases);
  if (exact) return exact;
  let found: ImportSchool | null = null;
  for (const s of dir) {
    if (!schoolMatches({ name: s.name, shortName: s.shortName, terms: terms.get(s.slug) ?? [] }, name)) continue;
    if (found) return null;
    found = s;
  }
  return found;
}

function programFor(modelProgram: string, name: string, lines: readonly string[]): MedListProgramId {
  const folded = foldForMatch(name);
  const beside = lines.filter((l) => foldForMatch(l).includes(folded));
  if (programOf(`${modelProgram} ${name}`) === 'PHD' && beside.some((l) => PHD_WORD.test(l))) return 'PHD';
  const plain = modelProgram.trim();
  if (/^(?:md|do)$/i.test(plain) && beside.some((l) => PLAIN_DEGREE.test(l))) {
    return 'REG';
  }
  return 'ANY';
}

export function validateListImport(
  output: unknown,
  ctx: { text: string; dir: readonly ImportSchool[]; aliases: AliasIndex },
): ValidatedList {
  const envelope = listModelOutput.safeParse(output);
  if (!envelope.success) return { rows: [], dropped: 0, capped: false };
  const folded = foldForMatch(ctx.text);
  const lines = ctx.text.split('\n');
  const terms = termsBySlug(ctx.aliases);
  const rows = new Map<string, ValidListRow>();
  let dropped = 0;
  let capped = false;

  envelope.data.schools.forEach((entry, index) => {
    const parsed = listModelRow.safeParse(entry);
    if (!parsed.success) {
      dropped += 1;
      return;
    }
    const name = parsed.data.name;
    const f = foldForMatch(name);
    // The name must be the member's own words (a name of under three characters never is: "MD" names no school).
    if (f.length < 3 || !folded.includes(f)) {
      dropped += 1;
      return;
    }
    const school = resolveListName(name, ctx.dir, ctx.aliases, terms);
    const program = programFor(parsed.data.program ?? '', name, lines);
    // An unmatched row keys on the folded name, so the same unknown name twice is one row and two names stay two.
    const key = school ? `${school.slug}|${program}` : `?unrecognised-${f}|${program}`;
    if (rows.has(key)) return;
    if (rows.size >= LIST_IMPORT_LIMITS.schools) {
      capped = true;
      return;
    }
    rows.set(key, {
      key: school ? key : `?unrecognised-${index}|${program}`,
      schoolName: name,
      school,
      program,
    });
  });

  return { rows: [...rows.values()], dropped, capped };
}
