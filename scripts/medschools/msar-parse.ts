/** The small value parsers shared by parse-msar-reports.ts and its checker (which re-derives each structured value). */

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** "September 12, 2026" -> "2026-09-12"; "September 2023" -> "2023-09"; anything else null. */
export function parseDate(text: string): string | null {
  const full = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(text.trim());
  if (full) {
    const m = MONTHS.indexOf(full[1]!.toLowerCase());
    if (m < 0) return null;
    return `${full[3]}-${String(m + 1).padStart(2, '0')}-${full[2]!.padStart(2, '0')}`;
  }
  const month = /^([A-Za-z]+) (\d{4})$/.exec(text.trim());
  if (month) {
    const m = MONTHS.indexOf(month[1]!.toLowerCase());
    return m < 0 ? null : `${month[2]}-${String(m + 1).padStart(2, '0')}`;
  }
  return null;
}

/** "$104,356" -> 104356. */
export function parseUsd(text: string): number | null {
  const m = /^\$(\d{1,3}(?:,\d{3})*|\d+)$/.exec(text.trim());
  return m ? Number(m[1]!.replace(/,/g, '')) : null;
}

/**
 * The PREview report's sentences. The PDF's text layer sometimes holds a wrapped second line ("process", "scores") in the
 * wrong cell, or cuts a sentence short at the cell edge, so a cell is read as the one sentence it begins with: the whole
 * sentence, or a leading part of one sentence, followed at most by a stray word. A cell that is neither is not read.
 */
const SENTENCES: Array<{ code: 'NOT_USED' | 'EXPLORING' | 'REQUIRED' | 'RECOMMENDED' | 'SJT_ACCEPTED'; text: string }> =
  [
    { code: 'NOT_USED', text: 'We are not using PREview scores in the admissions process' },
    {
      code: 'EXPLORING',
      text: 'Exploring PREview for Future use – will not be used in this cycle’s admissions decisions',
    },
    { code: 'REQUIRED', text: 'We are requiring applicants to submit PREview scores' },
    { code: 'RECOMMENDED', text: 'We are recommending applicants submit PREview scores' },
    {
      code: 'SJT_ACCEPTED',
      text: 'We are requiring applicants to submit situational judgment test (SJT) scores; PREview scores fulfill SJT',
    },
    { code: 'RECOMMENDED', text: 'We are recommending applicants to submit PREview scores' },
  ];

export function parsePreview(cell: string): { code: (typeof SENTENCES)[number]['code']; text: string } | null {
  const c = cell.trim();
  const whole = SENTENCES.find((s) => s.text === c);
  if (whole) return { code: whole.code, text: whole.text };
  // A sentence plus a stray wrapped word: the sentence.
  for (const stray of [' process', ' scores']) {
    const s = SENTENCES.find((x) => c.endsWith(stray) && c.slice(0, -stray.length) === x.text);
    if (s) return { code: s.code, text: s.text };
  }
  // Cut short at the cell edge: kept as printed, when every sentence it begins agrees on the answer.
  const hits = c.length >= 30 ? SENTENCES.filter((s) => s.text.startsWith(c)) : [];
  if (hits.length > 0 && new Set(hits.map((h) => h.code)).size === 1) return { code: hits[0]!.code, text: c };
  return null;
}
