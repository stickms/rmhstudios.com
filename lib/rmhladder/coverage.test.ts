import { describe, expect, it } from 'vitest';
import { formatCoverageSnapshot, type CoverageSnapshot } from './coverage';

const SNAP: CoverageSnapshot = {
  totalCompanies: 344,
  companiesWithActiveSource: 180,
  companiesManualOnly: 120,
  companiesUnconfigured: 44,
  activeJobsByFirmType: { bulge_bracket: 40, private_equity: 12, technology: 200 },
};

describe('formatCoverageSnapshot', () => {
  it('reports company coverage counts and a percentage', () => {
    const out = formatCoverageSnapshot(SNAP);
    expect(out).toContain('companies with an active source: 180 / 344');
    expect(out).toContain('52%'); // 180/344
  });
  it('lists active jobs by firm type, descending', () => {
    const out = formatCoverageSnapshot(SNAP);
    const techIdx = out.indexOf('technology: 200');
    const peIdx = out.indexOf('private_equity: 12');
    expect(techIdx).toBeGreaterThan(-1);
    expect(techIdx).toBeLessThan(peIdx); // higher counts first
  });
  it('handles an empty firm-type map', () => {
    const out = formatCoverageSnapshot({ ...SNAP, activeJobsByFirmType: {} });
    expect(out).toContain('(no active jobs)');
  });
});
