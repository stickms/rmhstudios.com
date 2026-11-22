import { parse } from 'node-html-parser';
import { normalizeSchoolKey } from '../../../engine/names';
import { UnexpectedPageError } from './parse-school';

export interface FirstDates {
  secondaryOn: string | null;
  interviewOn: string | null;
  acceptanceOn: string | null;
}
export interface FirstRow {
  key: string;
  displayName: string;
  degree: 'MD' | 'DO';
  reg: FirstDates;
  phd: FirstDates;
}

const NO_DATE = /^(not reported|protected for anonymity\*?)$/i;

function toIso(text: string): string | null {
  const t = text.trim();
  if (NO_DATE.test(t)) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!m) throw new UnexpectedPageError(`bad first-date cell: ${JSON.stringify(t)}`);
  return `${m[3]}-${m[1]}-${m[2]}`;
}

export function parseFirstTable(html: string): {
  cycleYear: number;
  rows: FirstRow[];
} {
  const root = parse(html);
  const table = root.querySelector('table[aria-describedby="firsts-note"]');
  if (!table) throw new UnexpectedPageError('no first-dates table');
  const cy = /for the (\d{4}) entry cycle/i.exec(table.querySelector('caption')?.text ?? '');
  if (!cy) throw new UnexpectedPageError('first-dates caption has no entry cycle');

  const rows: FirstRow[] = [];
  for (const tr of table.querySelectorAll('tbody tr')) {
    const link = tr.querySelector('th[scope="row"] a');
    const href = link?.getAttribute('href') ?? '';
    const m = /\/explorer\/school\/([^?#]+)/.exec(href);
    if (!link || !m) throw new UnexpectedPageError(`first-dates row without school link: ${href}`);
    const tds = tr.querySelectorAll('td').map((td) => td.text);
    if (tds.length !== 7) throw new UnexpectedPageError(`first-dates row has ${tds.length} cells`);
    const degree = tds[0]!.trim();
    if (degree !== 'MD' && degree !== 'DO') throw new UnexpectedPageError(`bad degree ${JSON.stringify(degree)}`);
    const dates = tds.slice(1).map(toIso);
    rows.push({
      // normalizeSchoolKey decodes (HTML + URL) itself; pass the raw tail once.
      key: normalizeSchoolKey(m[1]!),
      displayName: normalizeSchoolKey(link.text),
      degree,
      reg: {
        secondaryOn: dates[0]!,
        interviewOn: dates[1]!,
        acceptanceOn: dates[2]!,
      },
      phd: {
        secondaryOn: dates[3]!,
        interviewOn: dates[4]!,
        acceptanceOn: dates[5]!,
      },
    });
  }
  if (rows.length === 0) throw new UnexpectedPageError('first-dates table has no rows');
  return {
    cycleYear: Number(cy[1]),
    rows,
  };
}
