import { GemError } from '@/lib/cards/gems.server';

/** Run a gems action and turn a typed refusal into the response the client reads. */
export async function gemsResponse(run: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await run());
  } catch (err) {
    if (err instanceof GemError) return Response.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
