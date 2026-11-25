/**
 * Request schemas for the listing price endpoints (client-safe types via `import type` from the contract).
 */
import { z } from 'zod';

export const setPriceAlertsBody = z.object({ enabled: z.boolean() });
