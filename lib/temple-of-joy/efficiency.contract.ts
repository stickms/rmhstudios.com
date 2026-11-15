/** Contracts for /api/temple-of-joy/efficiency (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { Efficiency } from '@/lib/temple-of-joy/efficiency';

export const getTempleEfficiencyApi =
  endpoint<{
    res: {
      efficiency: Efficiency | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/temple-of-joy/efficiency',
    },
  );

export const rankTempleEfficiencyApi =
  endpoint<{
    res: {
      ok: true;
      efficiency: Efficiency;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/temple-of-joy/efficiency',
    },
  );
