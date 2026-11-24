/**
 * The server's check of what the model returned, and the only place a model's output becomes something a member sees.
 * The model is not trusted with any of it:
 *
 *  - the envelope and every row and milestone are checked against the schema (`import-schemas.ts`); a malformed row costs
 *    that row, not the import; the model's `notes` is never read;
 *  - a milestone `type` is one of the tracker's enum or the milestone is dropped;
 *  - a date is kept only when it is a real calendar day, its `raw` quote is found in the text that was sent, and the
 *    quote says that month and day (so an invented date cannot ride on a real header cell), and a year the quote writes
 *    is the date's year;
 *  - a year the file never wrote is inferred by the cycle rules (`engine/import.ts`), not taken from the model;
 *  - the date must be inside the tracker's window for the cycle (`milestoneDateProblem`);
 *  - a school is resolved from the name as written against the active schools and their aliases
 *    (`normalizeSchoolKey`), never from a slug or an id the model supplies; no unique match means "couldn't match".
 *
 * Pure: the text, the directory and the clock are arguments, so every rule is a unit test.
 */
import {
  foldForMatch,
  inferCycle,
  inferYear,
  isoDay,
  parseIsoDay,
  programOf,
  rawSupportsDate,
} from '../../engine/import';
import { normalizeSchoolKey } from '../../engine/names';
import { resolveSchools, type SchoolDirEntry } from '../../engine/qa/route';
import { MILESTONE_TYPES, milestoneDateProblem, type MilestoneType } from '../../engine/tracker';
import { IMPORT_LIMITS } from '../../engine/import';
import { modelMilestone, modelOutput, modelRow } from '../import-schemas';

export interface ImportSchool extends SchoolDirEntry {
  degree: 'MD' | 'DO';
}

/** Alias spellings (folded) to the slugs they name. */
export type AliasIndex = ReadonlyMap<string, readonly string[]>;

export interface ValidMilestone {
  type: MilestoneType;
  date: string;
  /** The file did not write the year; the cycle rules chose it. */
  yearInferred: boolean;
  /** A numeric date that reads as two different days (03/04). */
  ambiguous: boolean;
  /** The quote the date came from, cut for display. */
  from: string;
}

export interface ValidRow {
  key: string;
  schoolName: string;
  school: ImportSchool | null;
  program: 'REG' | 'PHD';
  milestones: ValidMilestone[];
}

export interface Validated {
  cycleYear: number;
  cycleFrom: 'dates' | 'hint' | 'default';
  rows: ValidRow[];
  /** Milestones dropped for want of a grounded, real, in-window date. */
  dropped: number;
}

const FROM_CHARS = 40;
const cut = (s: string): string => (s.length > FROM_CHARS ? `${s.slice(0, FROM_CHARS - 1)}…` : s);
const order = new Map(MILESTONE_TYPES.map((t, i) => [t, i]));
const MILESTONE_TYPE_SET: ReadonlySet<string> = new Set(MILESTONE_TYPES);

/** The school a written name is, or null: a unique directory match first, then a unique alias. Never the model's slug. */
export function matchSchool(
  name: string,
  dir: readonly ImportSchool[],
  aliases: AliasIndex,
): ImportSchool | null {
  const written = normalizeSchoolKey(name);
  const hit = resolveSchools([written], dir);
  if (hit.slugs.length === 1) return dir.find((s) => s.slug === hit.slugs[0]) ?? null;
  if (hit.unresolved.length === 0) return null;
  const slugs = aliases.get(foldForMatch(written));
  if (slugs && slugs.length === 1) return dir.find((s) => s.slug === slugs[0]) ?? null;
  return null;
}

interface Candidate {
  rowIndex: number;
  type: MilestoneType;
  y: number;
  m: number;
  d: number;
  yearWritten: boolean;
  ambiguous: boolean;
  raw: string;
}

/** The folded name appears in the folded text (a name of under three characters never does). */
function nameInText(name: string, foldedText: string): boolean {
  const f = foldForMatch(name);
  return f.length >= 3 && foldedText.includes(f);
}

export function validateImport(
  output: unknown,
  ctx: { text: string; dir: readonly ImportSchool[]; aliases: AliasIndex; now: Date },
): Validated {
  const envelope = modelOutput.safeParse(output);
  if (!envelope.success) return { cycleYear: inferCycle([], null, ctx.now).cycleYear, cycleFrom: 'default', rows: [], dropped: 0 };

  const folded = foldForMatch(ctx.text);
  let dropped = 0;
  const heads: { name: string; program: 'REG' | 'PHD' }[] = [];
  const candidates: Candidate[] = [];

  for (const rawRow of envelope.data.rows.slice(0, IMPORT_LIMITS.schools)) {
    const row = modelRow.safeParse(rawRow);
    if (!row.success) continue;
    const rowIndex = heads.length;
    heads.push({ name: row.data.schoolName, program: programOf(`${row.data.program ?? ''} ${row.data.schoolName}`) });
    for (const rawMilestone of row.data.milestones) {
      const m = modelMilestone.safeParse(rawMilestone);
      // A type outside the enum, a missing quote: not a milestone.
      if (!m.success || !MILESTONE_TYPE_SET.has(m.data.type)) {
        dropped += 1;
        continue;
      }
      const day = m.data.date === null ? null : parseIsoDay(m.data.date);
      const quote = foldForMatch(m.data.raw);
      // The quote must be text the member's file held, and must say the date it is quoted for.
      const said = day && quote && folded.includes(quote) ? rawSupportsDate(m.data.raw, day) : null;
      if (!day || !said) {
        dropped += 1;
        continue;
      }
      candidates.push({
        rowIndex,
        type: m.data.type,
        ...day,
        yearWritten: said.yearWritten,
        ambiguous: said.ambiguous,
        raw: m.data.raw.trim(),
      });
    }
  }

  const cycle = inferCycle(
    candidates.filter((c) => c.yearWritten),
    envelope.data.cycleHint ?? null,
    ctx.now,
  );

  const rows = new Map<string, ValidRow>();
  heads.forEach((head, rowIndex) => {
    // The name is shown only if the member's text holds it (or, for a school it resolved to, that school's own name): the
    // model's school name is otherwise its own words, and a made-up one must not reach the page or pick a school.
    const found = matchSchool(head.name, ctx.dir, ctx.aliases);
    const named = nameInText(head.name, folded);
    const school = found && (named || nameInText(found.name, folded) || nameInText(found.shortName, folded)) ? found : null;
    const shown = named ? head.name : '';
    // An unmatched row keeps its own key (never the model's words), so two unrecognised schools stay two rows.
    const key = `${school ? school.slug : `?unrecognised-${rowIndex}`}|${head.program}`;
    const milestones: ValidMilestone[] = [];
    for (const c of candidates.filter((x) => x.rowIndex === rowIndex)) {
      const y = c.yearWritten ? c.y : inferYear(c.type, c.m, c.d, cycle.cycleYear, ctx.now);
      const date = y === null ? null : isoDay(y, c.m, c.d);
      if (date === null || milestoneDateProblem(cycle.cycleYear, date, ctx.now) !== null) {
        dropped += 1;
        continue;
      }
      milestones.push({ type: c.type, date, yearInferred: !c.yearWritten, ambiguous: c.ambiguous, from: cut(c.raw) });
    }
    if (milestones.length === 0) return;
    const into = rows.get(key);
    if (!into) {
      rows.set(key, {
        key,
        schoolName: shown,
        school,
        program: head.program,
        milestones: [],
      });
    }
    const row = rows.get(key)!;
    // One date per type: the first the file gave stands; a second is a duplicate row, not another date.
    for (const m of milestones) {
      if (row.milestones.some((x) => x.type === m.type)) dropped += 1;
      else row.milestones.push(m);
    }
  });

  const out = [...rows.values()]
    .map((r) => ({ ...r, milestones: r.milestones.sort((a, b) => (order.get(a.type) ?? 0) - (order.get(b.type) ?? 0)) }))
    .sort((a, b) => (a.school?.name ?? a.schoolName).localeCompare(b.school?.name ?? b.schoolName) || a.program.localeCompare(b.program));
  return { cycleYear: cycle.cycleYear, cycleFrom: cycle.from, rows: out, dropped };
}
