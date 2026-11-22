import type { Cycle, Phase } from './calendar';
import type { ElectionSnapshot } from './types';

/** Body of GET /api/elections. */
export interface ElectionsApiResponse {
  cycle: Cycle;
  phase: Phase;
  /** Server clock, so countdowns do not trust a wrong device clock. */
  serverTime: string;
  snapshot: ElectionSnapshot;
}
