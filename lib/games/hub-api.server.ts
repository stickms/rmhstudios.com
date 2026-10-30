import { HubError } from '@/lib/games/hub.server';

/** Run a hub action and turn a typed refusal into the response the client reads. */
export async function hubResponse(run: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await run());
  } catch (err) {
    if (err instanceof HubError) {
      return Response.json({ error: err.code }, { status: err.status });
    }
    throw err;
  }
}
