import { describe, expect, it } from 'vitest';
import { encodeCsv, parseCsv, safeSpreadsheetCell } from './csv';

describe('RMHLadder CSV helpers', () => {
  it('protects spreadsheet formula cells', () => {
    expect(safeSpreadsheetCell('=IMPORTXML("x")')).toBe('\'=IMPORTXML("x")');
    expect(safeSpreadsheetCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
  });

  it('round-trips commas, quotes, and newlines', () => {
    const csv = encodeCsv([{ title: 'Analyst, Markets', notes: 'A "great"\nrole' }], ['title', 'notes']);
    expect(parseCsv(csv)).toEqual([
      ['title', 'notes'],
      ['Analyst, Markets', 'A "great"\nrole'],
    ]);
  });
});

