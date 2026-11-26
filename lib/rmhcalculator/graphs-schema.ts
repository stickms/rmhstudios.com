/**
 * s15-08 — saved RMHCalculator graphs: the limits, the zod schemas the routes validate against and the shapes the
 * contract (`graphs.contract.ts`, `import type` only) hands the client. Plain module: no server imports.
 */
import { z } from 'zod';
import { graphResultSchema, type GraphResult } from '@/lib/rmhcalculator/types';

/** At most this many saved graphs per member, checked under a lock (`createGraph`). */
export const CALC_GRAPH_LIMIT = 50;
export const CALC_GRAPH_TITLE_MAX = 80;
export const CALC_GRAPH_FUNCTIONS_MAX = 4;
export const CALC_GRAPH_FUNCTION_MAX = 200;
/** A result is at most 4 series of 400 points; the routes refuse a body over this many bytes. */
export const CALC_GRAPH_MAX_BODY_BYTES = 64 * 1024;

const title = z.string().trim().min(1).max(CALC_GRAPH_TITLE_MAX);
const functions = z.array(z.string().trim().min(1).max(CALC_GRAPH_FUNCTION_MAX)).min(1).max(CALC_GRAPH_FUNCTIONS_MAX);
const end = z.number().finite().nullable();

/** Both ends or neither; a domain's maximum exceeds its minimum. */
const domainOk = (d: { domainMin: number | null; domainMax: number | null }) =>
  (d.domainMin === null) === (d.domainMax === null) && (d.domainMin === null || d.domainMax! > d.domainMin);

export const createCalcGraphBody = z
  .object({ title, functions, domainMin: end, domainMax: end, result: graphResultSchema })
  .refine(domainOk, { message: 'domain max must exceed min' });
export type CreateCalcGraphBody = z.infer<typeof createCalcGraphBody>;

/** A change to a saved graph: a rename sends only `title`; "Plot again" sends the functions, domain and result. */
export const updateCalcGraphBody = z
  .object({
    title: title.optional(),
    functions: functions.optional(),
    domainMin: end.optional(),
    domainMax: end.optional(),
    result: graphResultSchema.optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'nothing to change' })
  .refine((b) => (b.domainMin === undefined) === (b.domainMax === undefined), { message: 'send both domain ends' })
  .refine(
    (b) =>
      b.domainMin === undefined ||
      b.domainMax === undefined ||
      domainOk({ domainMin: b.domainMin, domainMax: b.domainMax }),
    { message: 'domain max must exceed min' },
  );
export type UpdateCalcGraphBody = z.infer<typeof updateCalcGraphBody>;

/** A row of the "Saved graphs" list: everything but the points, which are fetched when one is opened. */
export interface CalcGraphSummary {
  id: string;
  title: string;
  functions: string[];
  domainMin: number | null;
  domainMax: number | null;
  updatedAt: string;
}

/** One saved graph. `result` is `null` when the stored points no longer parse: the client offers "Plot again". */
export interface CalcGraphFull extends CalcGraphSummary {
  result: GraphResult | null;
}
