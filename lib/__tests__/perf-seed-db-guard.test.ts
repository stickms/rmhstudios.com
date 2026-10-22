import { describe, it, expect } from 'vitest';
import { isPerfSeedDbName } from '../../scripts/perf/db-name-guard';

describe('perf seed database name guard', () => {
  it('accepts the throwaway names the program uses', () => {
    for (const n of [
      'rmh_perf',
      'rmh_perf_build',
      'rmh_perf_template',
      'rmh_ws',
      'rmh_ws4',
      'rmh_ws2_a',
    ]) {
      expect(isPerfSeedDbName(n), n).toBe(true);
    }
  });

  it('refuses production-like names that merely start with the prefix', () => {
    for (const n of [
      'rmh_wsprod',
      'rmh_perfprod',
      'rmh_perf_prod',
      'rmh_ws_prod',
      'rmh_perf-1',
      'rmh_ws4;drop',
      'rmh_production',
      'postgres',
      'rmh_perf_Build',
    ]) {
      expect(isPerfSeedDbName(n), n).toBe(false);
    }
  });
});
