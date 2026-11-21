import { parse } from 'node-html-parser';
import { cycleYearFromLabel } from '../../../engine/cycle';
import type { MedEventType, MedProgram, NormalizedCount } from '../../../engine/types';

/** The page is not the CycleTrack page we know (challenge, login, renamed layout) or a value is malformed. */
export class UnexpectedPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnexpectedPageError';
  }
}

export interface ParsedTable {
  program: MedProgram;
  cycleYear: number;
  /** Only cells with n > 0; an observed table with no events has an empty list. */
  counts: NormalizedCount[];
}

export interface ParsedSchoolPage {
  sourceStamp: string | null;
  tables: ParsedTable[];
  /** `tables` flattened. */
  counts: NormalizedCount[];
}

export const EVENT_COLUMNS: Record<string, MedEventType> = {
  secondary: 'SECONDARY',
  interview: 'INTERVIEW',
  rejection: 'REJECTION',
  waitlist: 'WAITLIST',
  acceptance: 'ACCEPTANCE',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUNT = /^\d+$/;

/** One validated cell (date, event, n) to NormalizedCount; shared with the summary.json parser. */
export function cycleTrackCount(
  schoolKey: string,
  program: MedProgram,
  cycleYear: number,
  date: string,
  eventType: MedEventType,
  count: number,
): NormalizedCount {
  return {
    source: 'CYCLETRACK',
    schoolKey,
    program,
    cycleYear,
    date,
    eventType,
    count,
    contributors: null,
  };
}

export function parseSchoolPage(html: string, schoolKey: string): ParsedSchoolPage {
  const root = parse(html);
  const sourceStamp = root.querySelector('time[data-update-full]')?.getAttribute('datetime') ?? null;
  const tables: ParsedTable[] = [];

  for (const [program, cls] of [
    ['REG', 'md_info'],
    ['PHD', 'phd_info'],
  ] as const) {
    for (const table of root.querySelectorAll(`details.${cls} table`)) {
      const m = /daily milestone observations, (\d{4}-\d{4})/i.exec(table.querySelector('caption')?.text ?? '');
      if (!m) continue; // the per-status totals tables carry a different caption
      let cycleYear: number;
      try {
        cycleYear = cycleYearFromLabel(m[1]!);
      } catch (e) {
        throw new UnexpectedPageError((e as Error).message);
      }

      const header = table.querySelectorAll('thead th[scope="col"]').map((th) => th.text.trim());
      if (header[0]?.toLowerCase() !== 'date' || header.length !== 6) {
        throw new UnexpectedPageError(`unexpected daily table header: ${header.join('|')}`);
      }
      const events = header.slice(1).map((h) => EVENT_COLUMNS[h.toLowerCase()]);
      if (events.some((e) => e === undefined) || new Set(events).size !== 5) {
        throw new UnexpectedPageError(`unexpected daily table event columns: ${header.join('|')}`);
      }

      const counts: NormalizedCount[] = [];
      for (const tr of table.querySelectorAll('tbody tr')) {
        const date = tr.querySelector('th[scope="row"]')?.text.trim() ?? '';
        if (!ISO_DATE.test(date)) throw new UnexpectedPageError(`bad row date: ${JSON.stringify(date)}`);
        const cells = tr.querySelectorAll('td').map((td) => td.text.trim());
        if (cells.length !== 5) throw new UnexpectedPageError(`row ${date} has ${cells.length} cells`);
        cells.forEach((cell, i) => {
          if (!COUNT.test(cell)) throw new UnexpectedPageError(`bad count ${JSON.stringify(cell)} on ${date}`);
          const n = Number(cell);
          if (n > 0) counts.push(cycleTrackCount(schoolKey, program, cycleYear, date, events[i]!, n));
        });
      }
      tables.push({
        program,
        cycleYear,
        counts,
      });
    }
  }

  if (sourceStamp === null && tables.length === 0) {
    throw new UnexpectedPageError('no freshness stamp and no daily tables');
  }
  return {
    sourceStamp,
    tables,
    counts: tables.flatMap((t) => t.counts),
  };
}
