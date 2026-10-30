import { MarketError } from '@/lib/cards/market.server';

/** Run a market action and turn a typed refusal into the response the client reads. */
export async function marketResponse(run: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await run());
  } catch (err) {
    if (err instanceof MarketError) {
      return Response.json({ error: err.code, message: err.message }, { status: err.status });
    }
    throw err;
  }
}
