/**
 * Turn the loadout service's expected failures into the site's error envelope,
 * so "not found" or a limit is a 4xx the builder can show — not a 500.
 */

import { apiError } from '@/lib/api/handler.server';
import { LoadoutError } from './loadout.server';

export async function guard(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof LoadoutError) return apiError(e.message, e.status);
    throw e;
  }
}
