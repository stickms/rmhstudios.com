export interface CoverageSnapshot {
  totalCompanies: number;
  companiesWithActiveSource: number;
  companiesManualOnly: number;
  companiesUnconfigured: number;
  activeJobsByFirmType: Record<string, number>;
}

export function formatCoverageSnapshot(s: CoverageSnapshot): string {
  const pct =
    s.totalCompanies > 0 ? Math.round((s.companiesWithActiveSource / s.totalCompanies) * 100) : 0;
  const lines: string[] = [];
  lines.push('coverage');
  lines.push('--------');
  lines.push(
    `companies with an active source: ${s.companiesWithActiveSource} / ${s.totalCompanies} (${pct}%)`,
  );
  lines.push(`  manual-only (no active API source): ${s.companiesManualOnly}`);
  lines.push(`  not yet active (unconfigured/blocked/no source): ${s.companiesUnconfigured}`);
  lines.push('active jobs by firm type:');
  const entries = Object.entries(s.activeJobsByFirmType).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    lines.push('  (no active jobs)');
  } else {
    for (const [firmType, count] of entries) lines.push(`  ${firmType}: ${count}`);
  }
  return lines.join('\n');
}
