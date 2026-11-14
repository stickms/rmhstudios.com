/**
 * Contracts for the Slice It chart editor's reads and publishes (redesign audit
 * C1, batch 8). Client-safe: types only, by `import type`.
 *
 * The autosave PATCH (batch 9) is called with `keepalive` on the unload path.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type {
  ChartDto,
  ChartPatchInput,
  ChartRevisionDto,
} from '@features/slice-it/engine/editor/api-schemas';

/** Seed (or fetch) the author's charts for a song: one row per difficulty. */
export const seedChartsApi =
  endpoint<{
    body: {
      songId: string;
      keys: number;
    };
    res: {
      charts: ChartDto[];
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/slice-it/charts',
    },
  );

/** Autosave / manual save of one difficulty's notes, timing map and SV markers. */
export const saveChartApi =
  endpoint<{
    body: ChartPatchInput;
    res: ChartDto;
  }>()(
    {
      method:
        'PATCH',
      path: '/api/slice-it/charts/$id',
    },
  );

/** Publish or un-publish one difficulty. 422 carries the blocking lint issues. */
export const publishChartApi =
  endpoint<{
    body: {
      status:
        | 'public'
        | 'draft';
    };
    res: ChartDto;
  }>()(
    {
      method:
        'POST',
      path: '/api/slice-it/charts/$id',
    },
  );

export const listChartRevisionsApi =
  endpoint<{
    res: {
      revisions: ChartRevisionDto[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/slice-it/charts/$id/revisions',
    },
  );
