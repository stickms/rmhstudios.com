import { prisma } from '@/lib/prisma.server';
import { SCHOOL_SLUG_RE } from '../engine/school-slug';
import {
  CURRICULUM_KIND_IDS,
  FACT_KINDS,
  MSAR_PAGE_URL,
  MSAR_REPORTS,
  PROFILE_UNDATED_CYCLE,
  isCurriculumKind,
  isFactKind,
  profileKindOf,
  type MsarReportId,
} from '../engine/school-facts';
import { MDPHD_CYCLE, MDPHD_KINDS, MDPHD_SOURCES, PHASES } from '../engine/mdphd';
import type {
  MedClassProfileDto,
  MedMdPhdDto,
  MedMdPhdPhaseDto,
  MedSchoolFactDto,
  MedSchoolFactsRes,
} from '../medschools.contract';

const day = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The facts of one active school, in the catalogue's order. Explicit `select`: nothing but the columns the DTO names.
 * One value per kind (the unique key is school x program x cycle x kind x source; each kind has one source and one
 * cycle), and nothing is averaged or merged across sources. Two catalogues: the AAMC report facts (source
 * `AAMC_MSAR_REPORT`, with a report id) and Admit's curriculum facts (source `ADMIT`, `reportId` null). A row is shown
 * only when its kind belongs to the catalogue of its own source, so a stray kind never reaches the page.
 */
export async function getSchoolFacts(slug: string): Promise<MedSchoolFactsRes | null> {
  if (!SCHOOL_SLUG_RE.test(slug)) return null;
  const school = await prisma.medSchool.findFirst({ where: { slug, active: true }, select: { id: true } });
  if (!school) return null;
  const [rows, phdRows, profileRows] = await Promise.all([
    prisma.medSchoolFact.findMany({
      where: { schoolId: school.id, program: 'REG', source: { not: 'SCHOOL_PROFILE' } },
      select: {
        kind: true,
        source: true,
        reportId: true,
        cycleYear: true,
        valueText: true,
        valueNum: true,
        valueJson: true,
        note: true,
        sourceUrl: true,
        sourceLabel: true,
        checkedOn: true,
        page: true,
      },
    }),
    prisma.medSchoolFact.findMany({
      where: {
        schoolId: school.id,
        program: 'PHD',
        cycleYear: MDPHD_CYCLE,
        kind: { in: [...MDPHD_KINDS] },
        source: { in: [...MDPHD_SOURCES] },
      },
      select: {
        kind: true,
        source: true,
        valueText: true,
        valueNum: true,
        valueJson: true,
        note: true,
        sourceUrl: true,
        checkedOn: true,
      },
    }),
    profileRowsOf(school.id),
  ]);
  const order: string[] = [...Object.keys(FACT_KINDS), ...CURRICULUM_KIND_IDS];
  const facts: MedSchoolFactDto[] = rows
    .filter((r) =>
      r.source === 'ADMIT'
        ? isCurriculumKind(r.kind)
        : r.source === 'AAMC_MSAR_REPORT' && isFactKind(r.kind) && r.reportId !== null,
    )
    .map((r) => {
      const json = r.valueJson as { text?: unknown } | null;
      return {
        kind: r.kind,
        reportId: r.reportId,
        report: r.reportId === null ? '' : (MSAR_REPORTS[r.reportId as MsarReportId] ?? ''),
        cycleYear: r.cycleYear,
        value: r.valueText,
        printed: json && typeof json.text === 'string' ? json.text : null,
        num: r.valueNum,
        note: r.note,
        sourceUrl: r.sourceUrl,
        sourceLabel: r.sourceLabel,
        checkedOn: day(r.checkedOn),
        page: r.page,
      };
    })
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return { pageUrl: MSAR_PAGE_URL, facts, mdphd: mdphdOf(phdRows), classes: classProfilesOf(profileRows) };
}

/** One school's `SCHOOL_PROFILE` rows (explicit `select`), for `classProfilesOf`. */
function profileRowsOf(schoolId: string): Promise<ProfileRow[]> {
  return prisma.medSchoolFact.findMany({
    where: { schoolId, source: 'SCHOOL_PROFILE', kind: { startsWith: 'PROFILE_' } },
    select: {
      kind: true,
      program: true,
      cycleYear: true,
      valueText: true,
      valueNum: true,
      valueJson: true,
      sourceUrl: true,
      checkedOn: true,
    },
  });
}

/** The entering classes of one school, as the Facts tab reads them (the link-preview card takes its figures here). */
export async function classProfilesForSchool(schoolId: string): Promise<MedClassProfileDto[]> {
  return classProfilesOf(await profileRowsOf(schoolId));
}

type PhdRow = {
  kind: string;
  source: string;
  valueText: string | null;
  valueNum: number | null;
  valueJson: unknown;
  note: string | null;
  sourceUrl: string;
  checkedOn: Date;
};

const PHASE_SET = new Set<string>(PHASES);

/** Only the phases the import wrote: a stray shape is dropped, never guessed into a phase. */
function phasesOf(json: unknown): MedMdPhdPhaseDto[] {
  const list = (json as { phases?: unknown } | null)?.phases;
  if (!Array.isArray(list)) return [];
  return list.flatMap((p: unknown) => {
    const o = p as { phase?: unknown; years?: unknown; label?: unknown };
    if (typeof o?.phase !== 'string' || !PHASE_SET.has(o.phase) || typeof o.label !== 'string') return [];
    const years = typeof o.years === 'number' && Number.isFinite(o.years) ? o.years : null;
    return [{ phase: o.phase as MedMdPhdPhaseDto['phase'], years, label: o.label }];
  });
}

/**
 * The MD-PhD block from the school's PHD rows. No program row: null (nothing is known, the page shows nothing). A "no
 * program" answer carries no timeline and no MSTP status, whatever else is stored.
 */
export function mdphdOf(rows: PhdRow[]): MedMdPhdDto | null {
  const program = rows.find((r) => r.kind === 'MDPHD_PROGRAM' && (r.valueText === 'YES' || r.valueText === 'NO'));
  if (!program) return null;
  const exists = program.valueText === 'YES';
  const name = (program.valueJson as { name?: unknown } | null)?.name;
  const out: MedMdPhdDto = {
    program: {
      exists,
      name: exists && typeof name === 'string' ? name : null,
      source: program.source === 'NIH_REPORTER' ? 'NIH_REPORTER' : 'SCHOOL_PAGE',
      sourceUrl: program.sourceUrl,
      checkedOn: day(program.checkedOn),
    },
    timeline: null,
    mstp: null,
  };
  if (!exists) return out;
  const t = rows.find((r) => r.kind === 'MDPHD_TIMELINE' && r.source === 'SCHOOL_PAGE');
  if (t && t.note) {
    out.timeline = {
      pattern: t.valueText,
      totalYears: t.valueNum,
      phases: phasesOf(t.valueJson),
      evidence: t.note,
      sourceUrl: t.sourceUrl,
      checkedOn: day(t.checkedOn),
    };
  }
  const m = rows.find((r) => r.kind === 'MSTP_T32' && r.source === 'NIH_REPORTER');
  if (m && (m.valueText === 'LISTED' || m.valueText === 'NOT_LISTED')) {
    const listed = m.valueText === 'LISTED';
    const grant = (m.valueJson as { grant?: unknown } | null)?.grant;
    out.mstp = {
      listed,
      grant: listed && typeof grant === 'string' ? grant : null,
      fiscalYear: listed ? m.valueNum : null,
      sourceUrl: m.sourceUrl,
      checkedOn: day(m.checkedOn),
    };
  }
  return out;
}

type ProfileRow = {
  kind: string;
  program: string;
  cycleYear: number;
  valueText: string | null;
  valueNum: number | null;
  valueJson: unknown;
  sourceUrl: string;
  checkedOn: Date;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/**
 * The entering classes from the `SCHOOL_PROFILE` rows: grouped by class (the cycle; undated classes are
 * `PROFILE_UNDATED_CYCLE`), the figures in the page's order, newest class first with an undated ("current") class ahead
 * of the dated ones. A row whose kind is not in the profile catalogue, or that lacks its printed value, label or evidence,
 * is dropped, never guessed.
 */
export function classProfilesOf(rows: ProfileRow[]): MedClassProfileDto[] {
  const byCycle = new Map<number, { dto: MedClassProfileDto; order: number[] }>();
  for (const r of rows) {
    const kind = profileKindOf(r.kind);
    const json = (r.valueJson ?? {}) as Record<string, unknown>;
    const value = str(json.text) ?? str(r.valueText);
    const label = str(json.label);
    const evidence = str(json.evidence);
    if (!kind || !value || !label || !evidence || (r.program !== 'REG' && r.program !== 'PHD')) continue;
    let entry = byCycle.get(r.cycleYear);
    if (!entry) {
      entry = {
        dto: {
          label,
          enteringYear: r.cycleYear === PROFILE_UNDATED_CYCLE ? null : r.cycleYear,
          url: r.sourceUrl,
          checkedOn: day(r.checkedOn),
          stats: [],
        },
        order: [],
      };
      byCycle.set(r.cycleYear, entry);
    }
    const order = typeof json.order === 'number' ? json.order : Number.MAX_SAFE_INTEGER;
    const at = entry.order.findIndex((o) => o > order);
    const stat = {
      kind,
      program: r.program,
      value,
      num: r.valueNum,
      qualifier: str(json.qualifier),
      evidence,
    } as const;
    if (at === -1) {
      entry.dto.stats.push(stat);
      entry.order.push(order);
    } else {
      entry.dto.stats.splice(at, 0, stat);
      entry.order.splice(at, 0, order);
    }
    if (day(r.checkedOn) > entry.dto.checkedOn) entry.dto.checkedOn = day(r.checkedOn);
  }
  const rank = (y: number) => (y === PROFILE_UNDATED_CYCLE ? Number.MAX_SAFE_INTEGER : y);
  return [...byCycle.entries()].sort((a, b) => rank(b[0]) - rank(a[0])).map(([, e]) => e.dto);
}
