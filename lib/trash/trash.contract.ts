/**
 * Contracts for the recycle bin (redesign audit C1, batch 3). Client-safe.
 * A refused restore/purge answers `{ error, reason }` — read `reason` with `errorField(e, 'reason')`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type {
  TrashKind,
  TrashPage,
} from '@/lib/trash/types';

export const listTrashApi =
  endpoint<{
    query: {
      kind?: TrashKind;
      cursor?: string;
    };
    res: TrashPage;
  }>()(
    {
      method:
        'GET',
      path: '/api/trash',
    },
  );

export const restoreTrashApi =
  endpoint<{
    body: {
      kind: TrashKind;
      id: string;
    };
    res: {
      ok: true;
      kind: TrashKind;
      id: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/trash/restore',
    },
  );

export const purgeTrashApi =
  endpoint<{
    res: {
      ok: true;
      kind: TrashKind;
      id: string;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/trash/$kind/$id',
    },
  );
