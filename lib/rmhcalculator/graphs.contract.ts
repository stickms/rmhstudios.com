/**
 * Contracts for the member's saved RMHCalculator graphs (s15-08). Client-safe: types come from the schemas by
 * `import type`, so no zod ships.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type {
  CalcGraphFull,
  CalcGraphSummary,
  CreateCalcGraphBody,
  UpdateCalcGraphBody,
} from '@/lib/rmhcalculator/graphs-schema';

export const listCalcGraphsApi = endpoint<{ res: { graphs: CalcGraphSummary[] } }>()({
  method: 'GET',
  path: '/api/rmhcalculator/graphs',
});

export const createCalcGraphApi = endpoint<{ body: CreateCalcGraphBody; res: { id: string } }>()({
  method: 'POST',
  path: '/api/rmhcalculator/graphs',
});

export const getCalcGraphApi = endpoint<{ res: { graph: CalcGraphFull } }>()({
  method: 'GET',
  path: '/api/rmhcalculator/graphs/$id',
});

export const updateCalcGraphApi = endpoint<{ body: UpdateCalcGraphBody; res: { ok: true } }>()({
  method: 'PUT',
  path: '/api/rmhcalculator/graphs/$id',
});

export const deleteCalcGraphApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/rmhcalculator/graphs/$id',
});
