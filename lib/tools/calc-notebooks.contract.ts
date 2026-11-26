/**
 * Contracts for the member's RMHCalculator notebooks (`/api/calc-notebooks`). Client-safe: types come from the zod
 * schema by `import type`. The Notebook tab calls these through React Query instead of the untyped `toolsApi`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { calcNotebookSchema } from '@/lib/tools/schemas';

export type CalcNotebookInput = z.infer<typeof calcNotebookSchema>;

export interface CalcNotebookRow {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

export const listCalcNotebooksApi = endpoint<{ res: { notebooks: CalcNotebookRow[] } }>()({
  method: 'GET',
  path: '/api/calc-notebooks',
});

export const createCalcNotebookApi = endpoint<{ body: CalcNotebookInput; res: { id: string } }>()({
  method: 'POST',
  path: '/api/calc-notebooks',
});

export const updateCalcNotebookApi = endpoint<{ body: CalcNotebookInput; res: { ok: true } }>()({
  method: 'PUT',
  path: '/api/calc-notebooks/$id',
});

export const deleteCalcNotebookApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/calc-notebooks/$id',
});
