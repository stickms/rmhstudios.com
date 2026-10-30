import { CollectionError } from '@/lib/games/collections.server';

/** Run a collections action and turn a typed refusal into the response the client reads. */
export async function collectionsResponse(run: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await run());
  } catch (err) {
    if (err instanceof CollectionError) {
      return Response.json({ error: err.code }, { status: err.status });
    }
    throw err;
  }
}
